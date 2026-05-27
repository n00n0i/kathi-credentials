"""
KathiCredentials MCP Server — SSE-based (no extra deps beyond FastAPI).

Each tool:
  1. Validate Bearer token
  2. Check permissions
  3. Execute with Neo4j
  4. Log to audit
  5. Return structured result

SSE endpoint: GET /mcp/sse  (Server-Sent Events stream)
Post endpoint: POST /mcp/commands  (send JSON-RPC 2.0 commands)
"""
import json
import uuid
import asyncio
from datetime import datetime
from typing import Any, Callable, Awaitable

from fastapi import APIRouter, HTTPException, Header
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse

from api.auth import validate_token, check_permission
from api.neo4j_client import get_neo4j
from api.encryption import encrypt_value, decrypt_value
from api.telegram import notify_credential_access

router = APIRouter(prefix="/mcp", tags=["mcp"])

# ── Tool registry ─────────────────────────────────────────────────────────────

TOOLS: dict[str, dict[str, Any]] = {}

def register_tool(name: str, description: str, permissions: list[str]):
    def decorator(fn: Callable[..., Awaitable[dict]]):
        TOOLS[name] = {
            "description": description,
            "permissions": permissions,
            "handler": fn,
        }
        return fn
    return decorator


def audit_log(validation: dict, action: str, resource_type: str, resource_id: str, success: bool):
    db = get_neo4j()
    db.create_audit_log(
        action=action,
        agent_id=validation["agent_id"],
        resource_type=resource_type,
        resource_id=resource_id,
        success=success,
    )


# ── Tool implementations ─────────────────────────────────────────────────────

@register_tool("authenticate", "Validate a token and return session info", [])
async def tool_authenticate(validation: dict) -> dict:
    return {
        "status": "ok",
        "agent_id": validation["agent_id"],
        "name": validation["name"],
        "permissions": validation["permissions"],
        "expires_at": validation["expires_at"],
    }


@register_tool("list_hosts", "List all hosts the agent has access to", ["host:read"])
async def tool_list_hosts(validation: dict) -> dict:
    db = get_neo4j()
    hosts = db.list_hosts()
    return {"hosts": hosts, "count": len(hosts)}


@register_tool("search_hosts", "Search hosts by hostname, IP, role, or tags", ["host:read"])
async def tool_search_hosts(validation: dict, q: str) -> dict:
    db = get_neo4j()
    hosts = db.search_hosts(query=q)
    return {"hosts": hosts, "count": len(hosts)}


@register_tool("get_host", "Get a single host by ID", ["host:read"])
async def tool_get_host(validation: dict, host_id: str) -> dict:
    db = get_neo4j()
    host = db.get_host(host_id)
    if not host:
        raise FileNotFoundError(f"Host {host_id} not found")
    return {"host": host}


@register_tool("create_host", "Register a new host", ["host:write"])
async def tool_create_host(validation: dict, hostname: str, ip: str = "",
                           role: str = "", owner: str = "", tags: list[str] = None,
                           environment: str = "") -> dict:
    db = get_neo4j()
    host = db.create_host(
        hostname=hostname, ip=ip, role=role, owner=owner,
        tags=tags or [], environment=environment,
    )
    audit_log(validation, "host.create", "host", host["host_id"], True)
    return {"host": host}


@register_tool("list_credentials", "List credentials (values redacted)", ["credential:read"])
async def tool_list_credentials(validation: dict, host_id: str) -> dict:
    db = get_neo4j()
    creds = db.list_credentials(host_id)
    for c in creds:
        c.pop("encrypted_value", None)
    return {"credentials": creds, "count": len(creds)}


@register_tool("get_credential", "Get a credential by ID (decrypted value + Telegram notify)", ["credential:read"])
async def tool_get_credential(validation: dict, credential_id: str) -> dict:
    db = get_neo4j()
    cred = db.get_credential(credential_id)
    if not cred:
        raise FileNotFoundError(f"Credential {credential_id} not found")

    decrypted_value = decrypt_value(cred["encrypted_value"])
    cred["value"] = decrypted_value
    cred.pop("encrypted_value", None)

    try:
        await notify_credential_access(
            agent_name=validation["name"],
            credential_type=cred.get("type", "secret"),
            hostname=cred.get("hostname", "unknown"),
            credential_id=credential_id,
        )
    except Exception:
        pass

    audit_log(validation, "credential.read", "credential", credential_id, True)
    return {"credential": cred}


@register_tool("create_credential", "Store a new credential", ["credential:write"])
async def tool_create_credential(validation: dict, host_id: str, type: str, key_ref: str,
                                  value: str, owner: str = "") -> dict:
    db = get_neo4j()
    encrypted = encrypt_value(value)
    cred = db.create_credential(
        host_id=host_id, type=type, key_ref=key_ref,
        encrypted_value=encrypted, owner=owner or validation["agent_id"],
    )
    audit_log(validation, "credential.create", "credential", cred["credential_id"], True)
    return {"credential_id": cred["credential_id"]}


@register_tool("update_credential", "Update a credential value", ["credential:write"])
async def tool_update_credential(validation: dict, credential_id: str, value: str) -> dict:
    db = get_neo4j()
    encrypted = encrypt_value(value)
    db.update_credential(credential_id, encrypted_value=encrypted)
    audit_log(validation, "credential.update", "credential", credential_id, True)
    return {"credential_id": credential_id, "status": "updated"}


@register_tool("delete_credential", "Delete a credential", ["credential:delete"])
async def tool_delete_credential(validation: dict, credential_id: str) -> dict:
    db = get_neo4j()
    db.delete_credential(credential_id)
    audit_log(validation, "credential.delete", "credential", credential_id, True)
    return {"credential_id": credential_id, "status": "deleted"}


@register_tool("get_audit_log", "Query audit log with filters", ["audit:read"])
async def tool_get_audit_log(validation: dict, agent_id: str = None,
                              resource_type: str = None, limit: int = 100) -> dict:
    db = get_neo4j()
    logs = db.get_audit_log(agent_id=agent_id, resource_type=resource_type, limit=limit)
    return {"logs": logs, "count": len(logs)}


@register_tool("create_agent", "Register a new agent (admin only)", ["agent:write"])
async def tool_create_agent(validation: dict, name: str, permissions: list[str]) -> dict:
    db = get_neo4j()
    agent = db.create_agent(name=name, permissions=permissions)
    audit_log(validation, "agent.create", "agent", agent["agent_id"], True)
    return {"agent": agent}


# ── Execute tool ──────────────────────────────────────────────────────────────

async def execute_tool(tool_name: str, params: dict, token: str) -> dict:
    if tool_name not in TOOLS:
        return {"error": f"Unknown tool: {tool_name}", "code": -32601}

    tool = TOOLS[tool_name]
    handler = tool["handler"]

    try:
        # Validate token upfront
        validation_result = validate_token(token)
        if not validation_result["valid"]:
            return {"error": "Invalid or expired token", "code": -32500}
        validation = {
            "agent_id": validation_result["agent_id"],
            "name": validation_result["name"],
            "permissions": validation_result["permissions"],
            "expires_at": validation_result["expires_at"],
        }

        result = await handler(validation, **params)
        return {"id": str(uuid.uuid4()), "status": "ok", "result": result}
    except PermissionError as e:
        return {"id": str(uuid.uuid4()), "status": "error", "code": -32500, "message": str(e)}
    except FileNotFoundError as e:
        return {"id": str(uuid.uuid4()), "status": "error", "code": -32502, "message": str(e)}
    except Exception as e:
        return {"id": str(uuid.uuid4()), "status": "error", "code": -32501, "message": f"Internal error: {e}"}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/sse")
async def mcp_sse(request: Request, authorization: str = Header(None)):
    """
    SSE endpoint — client connects here to receive async events.
    For now, returns a simple acknowledgment.
    """
    async def stream():
        yield {"event": "connected", "data": json.dumps({"status": "ok", "message": "MCP SSE connected"})}
        while True:
            await asyncio.sleep(30)
            yield {"event": "heartbeat", "data": json.dumps({"ts": datetime.utcnow().isoformat()})}

    return EventSourceResponse(stream())


@router.post("/commands")
async def mcp_commands(payload: dict, authorization: str = Header(None)):
    """
    JSON-RPC 2.0 command interface.
    {
      "method": "tools/call",
      "params": { "name": "list_hosts", "params": { "limit": 10 } },
      "id": 1
    }
    """
    token = _extract_token(authorization)

    method = payload.get("method", "")
    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": [
                {"name": name, "description": info["description"]}
                for name, info in TOOLS.items()
            ]
        }

    if method == "tools/call":
        params = payload.get("params", {})
        tool_name = params.get("name", "")
        tool_params = params.get("params", {})
        result = await execute_tool(tool_name, tool_params, token)
        return {"jsonrpc": "2.0", "id": payload.get("id"), **result}

    return {"jsonrpc": "2.0", "id": payload.get("id"),
            "error": {"code": -32601, "message": f"Unknown method: {method}"}}


@router.get("/tools")
async def list_tools(authorization: str = Header(None)):
    """REST list of available MCP tools."""
    token = _extract_token(authorization)
    validation = validate_token(token)
    if not validation["valid"]:
        raise HTTPException(401, "Invalid token")
    return {"tools": [
        {"name": name, "description": info["description"], "permissions": info["permissions"]}
        for name, info in TOOLS.items()
    ]}


def _extract_token(authorization: str) -> str:
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Must use Bearer token")
    return authorization[7:]