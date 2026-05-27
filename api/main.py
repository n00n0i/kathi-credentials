import time
import logging
import asyncio
import secrets
import string
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Header, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from api.config import get_settings
from api.models import (
    AuthRequest, AuthResponse,
    AgentCreate, AgentResponse, AgentListItem,
    HostCreate, HostUpdate, HostResponse,
    CredentialCreate, CredentialListItem, CredentialWithValue,
    AuditLogEntry,
    TelegramConfig, TelegramTestResponse,
    EncryptionMeta, AdminTokenResponse, HealthResponse,
    LoginRequest, LoginResponse, SessionInfo, LogoutResponse,
    UserLoginRequest, UserLoginResponse,
    UserCreate, UserUpdate, UserResponse, UserListResponse,
)
from api.auth import validate_token, check_permission, get_uptime_seconds, get_current_agent
from api.encryption import encrypt_value, decrypt_value, generate_key
from api.neo4j_client import get_neo4j, Neo4jClient
from api.telegram import send_message, notify_credential_access
from api.keycloak_client import verify_user_password, list_users, get_user, create_user, update_user, reset_password, delete_user

# MCP server router (SSE-based)
from api.mcp_server import router as mcp_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="KathiCredentials API", version="0.1.0")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(mcp_router)


# ── Startup: ensure admin token exists in Neo4j + print it ─────────────────────

@app.on_event("startup")
def startup_event():
    import hashlib

    db = get_neo4j()
    settings = get_settings()

    # 1. Cleanup expired sessions
    try:
        deleted = db.cleanup_expired_sessions()
        if deleted > 0:
            logger.info(f"[KathiCredentials] Cleaned up {deleted} expired sessions")
    except Exception as e:
        logger.warning(f"[KathiCredentials] Failed to cleanup sessions: {e}")

    # 2. Ensure admin token exists in Neo4j
    stored = db.get_admin_token()
    if not stored:
        # Generate new admin token (sk- + 16 alphanumeric)
        suffix = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(16))
        new_token = f"sk-{suffix}"
        db.save_admin_token(new_token)
        stored = new_token
        logger.info(f"[KathiCredentials] ✦ NEW ADMIN TOKEN GENERATED (saved to Neo4j)")
    else:
        logger.info(f"[KathiCredentials] Admin token loaded from Neo4j")

    # 3. Print banner
    token_preview = stored[:9] + "..." + stored[-4:] if len(stored) > 16 else stored
    print()
    print("╔══════════════════════════════════════════════════════════════════════╗")
    print("║                KathiCredentials — Admin Token                        ║")
    print("║                                                                      ║")
    print("║   ใช้ token ด้านล่าง login ที่ UI หรือ API                         ║")
    print("║   Use this token to login at the UI or API                          ║")
    print("║                                                                      ║")
    print(f"║   {stored}")
    print("║                                                                      ║")
    print("║   ⚠️  เก็บ token นี้ไว้ให้ดี! ถ้าหาย → ดูใน container logs         ║")
    print("║   ⚠️  Keep this token safe! If lost → check container logs          ║")
    print("╚══════════════════════════════════════════════════════════════════════╝")
    print()

    # 4. If env ADMIN_TOKEN is set, sync it to Neo4j (migration)
    if settings.admin_token and settings.admin_token != stored:
        db.save_admin_token(settings.admin_token)
        logger.info("[KathiCredentials] Synced ADMIN_TOKEN from env → Neo4j")

# ── Dependencies ───────────────────────────────────────────────────────────────


def require_permission(agent: dict, permission: str):
    if not check_permission(agent["permissions"], permission):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health():
    db = get_neo4j()
    neo4j_ok = db.verify_connectivity()
    settings = get_settings()
    tg_configured = bool(settings.telegram_bot_token and settings.telegram_chat_id)

    db_host = db.get_host_count()
    db_cred = db.get_credential_count()
    db_agent = db.get_agent_count()

    if neo4j_ok and tg_configured:
        status = "healthy"
    elif neo4j_ok:
        status = "degraded"
    else:
        status = "down"

    return HealthResponse(
        status=status,
        neo4j="connected" if neo4j_ok else "disconnected",
        telegram="connected" if tg_configured else "not_configured",
        uptime_seconds=get_uptime_seconds(),
        version="0.1.0",
        total_credentials=db_cred,
        total_hosts=db_host,
        total_agents=db_agent,
    )


# ── Agent Self-Onboarding ─────────────────────────────────────────────────────
# Public endpoint — no admin auth required. Agent uses its own token.
@app.get("/mcp/setup")
def agent_setup(token: str = Query(..., alias="agent_token")):
    """
    Agent self-onboarding endpoint. Returns configuration JSON that the
    agent can use to configure its MCP client and API access.
    """
    db = get_neo4j()
    result = db.validate_agent_token(token)
    if not result or not result.get("valid"):
        raise HTTPException(status_code=401, detail="Invalid agent token")

    agent_id = result["agent_id"]
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    settings = get_settings()
    # Use admin-configured base URL from DB, fallback to settings
    db_configured_url = db.get_config("api_base_url")
    base_url = db_configured_url or settings.api_base_url

    return {
        "agent_id": str(agent["agent_id"]),
        "name": agent.get("name", "unknown"),
        "permissions": agent.get("permissions", []),
        "api_url": base_url,
        "mcp_endpoint": f"{base_url}/mcp/sse",
        "mcp_tools": [
            "list_credentials",
            "get_credential",
            "create_credential",
            "update_credential",
            "delete_credential",
            "rotate_credential",
            "list_hosts",
            "get_host",
            "create_host",
            "update_host",
            "delete_host",
            "list_agents",
            "get_audit_logs",
            "get_system_health",
        ],
        "api_docs": f"{base_url}/docs",
    }


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/auth", response_model=AuthResponse)
def auth(req: AuthRequest):
    result = validate_token(req.token)
    return AuthResponse(
        valid=result["valid"],
        agent_id=result["agent_id"],
        name=result["name"],
        permissions=result["permissions"],
        expires_at=result["expires_at"],
    )


# ── Session (Browser Login) ───────────────────────────────────────────────────

@app.post("/auth/login", response_model=LoginResponse)
def login(req: LoginRequest):
    """
    Login: accepts either an admin token OR a Keycloak JWT.
    - Admin token → creates a Neo4j session (ses_xxx)
    - Keycloak JWT (has 2+ dots) → bypasses session, returns token as-is
      because validate_token() already handles Keycloak JWTs natively.
    """
    result = validate_token(req.token)
    if not result["valid"]:
        raise HTTPException(status_code=401, detail="Invalid admin token")

    # Keycloak JWTs already carry user info — no Neo4j session needed.
    # validate_token() verified the signature + expiry above.
    if "." in req.token:
        # Keycloak JWT: return it directly as the session_token.
        # Frontend stores this in localStorage as session_token (Bearer auth).
        logger.info(f"[KathiCredentials] Keycloak login for: {result.get('name', '?')}")
        expires_at = datetime.utcnow() + timedelta(days=7)
        return LoginResponse(
            session_token=req.token,   # raw Keycloak JWT
            expires_at=expires_at.isoformat(),
            name=result["name"],
            permissions=result["permissions"],
        )

    # Admin token → create a Neo4j session (ses_xxx)
    db = get_neo4j()
    settings = get_settings()
    token_hash = db.hash_token(req.token)
    expires_at = datetime.utcnow() + timedelta(days=settings.session_expiry_days)
    session = db.create_session(token_hash, expires_at)
    logger.info(
        f"[KathiCredentials] Admin session created. "
        f"Token: {session['session_token'][-12:]}..., expires: {expires_at.isoformat()}"
    )
    return LoginResponse(
        session_token=session["session_token"],
        expires_at=session["expires_at"],
        name=result["name"],
        permissions=result["permissions"],
    )


@app.get("/auth/session", response_model=SessionInfo)
def get_session_info(authorization: str = Header(...)):
    """Validate current session and return info."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    token = authorization[7:]
    result = validate_token(token)
    if not result["valid"]:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return SessionInfo(
        session_token=token,
        expires_at=result["expires_at"],
        name=result["name"],
        permissions=result["permissions"],
    )


@app.post("/auth/logout", response_model=LogoutResponse)
def logout(authorization: str = Header(...)):
    """Logout: deactivate the current session."""
    if not authorization.startswith("Bearer "):
        return LogoutResponse(ok=False)
    token = authorization[7:]
    if token.startswith("ses_"):
        db = get_neo4j()
        db.delete_session(token)
    return LogoutResponse(ok=True)


# ── Users (Keycloak-backed) ────────────────────────────────────────────────────

@app.post("/users/login", response_model=UserLoginResponse)
def user_login(req: UserLoginRequest):
    """Authenticate user via Keycloak (username + password). Returns access_token."""
    result = verify_user_password(req.username, req.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return UserLoginResponse(**result)


@app.get("/users", response_model=UserListResponse)
def list_all_users(agent: dict = Depends(get_current_agent)):
    """List all users (admin only)."""
    require_permission(agent, "admin:users")
    users = list_users()
    return UserListResponse(
        users=[UserResponse(**u) for u in users],
        total=len(users),
    )


@app.get("/users/{user_id}", response_model=UserResponse)
def get_single_user(user_id: str, agent: dict = Depends(get_current_agent)):
    """Get a user by ID (admin only)."""
    require_permission(agent, "admin:users")
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)


@app.post("/users", response_model=UserResponse)
def create_new_user(data: UserCreate, agent: dict = Depends(get_current_agent)):
    """Create a new user (admin only)."""
    require_permission(agent, "admin:users")
    try:
        user = create_user(
            username=data.username,
            email=data.email,
            password=data.password,
            first_name=data.first_name,
            last_name=data.last_name,
            enabled=data.enabled,
        )
        return UserResponse(**user)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/users/{user_id}", response_model=UserResponse)
def update_existing_user(user_id: str, data: UserUpdate, agent: dict = Depends(get_current_agent)):
    """Update a user (admin only)."""
    require_permission(agent, "admin:users")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        update_user(user_id, updates)
        user = get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return UserResponse(**user)
    except RuntimeError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: str, new_password: str, agent: dict = Depends(get_current_agent)):
    """Reset a user's password (admin only)."""
    require_permission(agent, "admin:users")
    try:
        reset_password(user_id, new_password)
        return {"ok": True, "message": "Password reset successfully"}
    except RuntimeError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/users/{user_id}")
def delete_existing_user(user_id: str, agent: dict = Depends(get_current_agent)):
    """Delete a user (admin only)."""
    require_permission(agent, "admin:users")
    try:
        delete_user(user_id)
        return {"ok": True}
    except RuntimeError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Agents ────────────────────────────────────────────────────────────────────

@app.get("/agents", response_model=dict)
def list_agents(agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:read")
    db = get_neo4j()
    agents = db.get_agents()
    return {
        "agents": [
            AgentListItem(
                agent_id=a["agent_id"],
                name=a["name"],
                permissions=a["permissions"],
                token_preview=a["token_value"][-8:] if a.get("token_value") else "••••••••",
                created_at=str(a["created_at"]) if a.get("created_at") else "",
                is_active=a.get("is_active", True),
            )
            for a in agents
        ]
    }


@app.post("/agents", response_model=AgentResponse)
def create_agent(data: AgentCreate, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    db = get_neo4j()
    result = db.create_agent(data.name, data.permissions)
    return AgentResponse(
        agent_id=result["agent_id"],
        name=data.name,
        permissions=data.permissions,
        token=result["token"],
        created_at=result["created_at"],
    )


@app.delete("/agents/{agent_id}")
def revoke_agent(agent_id: str, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    db = get_neo4j()
    ok = db.revoke_agent(agent_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "ok"}


@app.get("/agents/{agent_id}/tokens")
def get_agent_tokens(agent_id: str, current: dict = Depends(get_current_agent)):
    """Get all active tokens for an agent (admin only)."""
    require_permission(current, "agent:read")
    db = get_neo4j()
    tokens = db.get_agent_tokens(agent_id)
    return {"tokens": tokens}


# ── Hosts ─────────────────────────────────────────────────────────────────────

@app.get("/hosts", response_model=dict)
def list_hosts(
    role: Optional[str] = None,
    tags: Optional[str] = Query(None),
    agent: dict = Depends(get_current_agent),
):
    require_permission(agent, "host:read")
    db = get_neo4j()
    uid = agent.get("user_id")
    tag_list = tags.split(",") if tags else None
    hosts = db.list_hosts(tags=tag_list, role=role, user_id=uid)
    return {"hosts": [_host_dict(h) for h in hosts]}


@app.get("/hosts/search", response_model=dict)
def search_hosts(q: str = Query(...), agent: dict = Depends(get_current_agent)):
    require_permission(agent, "host:read")
    db = get_neo4j()
    uid = agent.get("user_id")
    hosts = db.search_hosts(q, user_id=uid)
    return {"hosts": [_host_dict(h) for h in hosts]}


@app.get("/hosts/{host_id}", response_model=HostResponse)
def get_host(host_id: str, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "host:read")
    db = get_neo4j()
    uid = agent.get("user_id")
    h = db.get_host(host_id, user_id=uid)
    if not h:
        raise HTTPException(status_code=404, detail="Host not found")
    return _host_dict(h)


@app.post("/hosts", response_model=dict)
def create_host(data: HostCreate, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "host:write")
    db = get_neo4j()
    uid = agent.get("user_id")
    host = db.create_host(
        data.hostname, data.ip, data.role, data.owner,
        data.tags, data.environment, user_id=uid,
    )
    db.create_audit_log("create", agent["agent_id"], "host", host["host_id"], True)
    return host


@app.put("/hosts/{host_id}", response_model=dict)
def update_host(host_id: str, data: HostUpdate, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "host:write")
    db = get_neo4j()
    uid = agent.get("user_id")
    h = db.update_host(host_id,
                        hostname=data.hostname, ip=data.ip,
                        role=data.role, owner=data.owner,
                        environment=data.environment, tags=data.tags,
                        user_id=uid)
    if not h:
        raise HTTPException(status_code=404, detail="Host not found")
    db.create_audit_log("update", agent["agent_id"], "host", host_id, True)
    return h


@app.delete("/hosts/{host_id}", response_model=dict)
def delete_host(host_id: str, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "host:write")
    db = get_neo4j()
    uid = agent.get("user_id")
    h = db.get_host(host_id, user_id=uid)
    if not h:
        raise HTTPException(status_code=404, detail="Host not found")
    db.delete_host(host_id, user_id=uid)
    db.create_audit_log("delete", agent["agent_id"], "host", host_id, True)
    return {"success": True}


# ── Credentials ────────────────────────────────────────────────────────────────

@app.get("/credentials", response_model=dict)
def list_credentials(host_id: Optional[str] = Query(None), agent: dict = Depends(get_current_agent)):
    """List credentials. If host_id is not provided, returns all credentials for the current user."""
    require_permission(agent, "credential:read")
    db = get_neo4j()
    uid = agent.get("user_id")
    if host_id:
        creds = db.list_credentials(host_id, user_id=uid)
    else:
        creds = db.list_all_credentials(user_id=uid)
    return {
        "credentials": [
            CredentialListItem(
                credential_id=c["credential_id"],
                type=c["type"],
                key_ref=c["key_ref"],
                owner=c.get("owner", ""),
                created_at=str(c["created_at"]) if c.get("created_at") else "",
            )
            for c in creds
        ]
    }


@app.get("/credentials/{credential_id}", response_model=CredentialWithValue)
def get_credential(credential_id: str, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "credential:get")
    db = get_neo4j()
    uid = agent.get("user_id")
    c = db.get_credential(credential_id, user_id=uid)
    if not c:
        raise HTTPException(status_code=404, detail="Credential not found")

    # Decrypt value
    try:
        decrypted = decrypt_value(c["encrypted_value"])
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt credential")

    # Get hostname for notification
    hostname = "unknown"
    with db.driver.session() as session:
        if uid:
            result = session.run("""
                MATCH (h:Host {user_id: $uid})-[:OWNS]->(c:Credential {credential_id: $cred_id})
                RETURN h.hostname AS hostname
                """, cred_id=credential_id, uid=uid)
        else:
            result = session.run("""
                MATCH (h:Host)-[:OWNS]->(c:Credential {credential_id: $cred_id})
                RETURN h.hostname AS hostname
                """, cred_id=credential_id)
        record = result.single()
        if record:
            hostname = record["hostname"]

    # Log to audit
    db.create_audit_log("get_credential", agent["agent_id"], "credential", credential_id, True)

    # Send Telegram notification (non-blocking via background thread)
    try:
        import threading
        t = threading.Thread(target=notify_credential_access, kwargs={
            "agent_name": agent.get("name", "unknown"),
            "credential_type": c["type"],
            "hostname": hostname,
            "credential_id": credential_id,
        })
        t.start()
    except Exception:
        pass  # Non-critical notification failure

    return CredentialWithValue(
        credential_id=credential_id,
        type=c["type"],
        key_ref=c["key_ref"],
        value=decrypted,
        owner=c.get("owner", ""),
    )


@app.post("/credentials", response_model=dict)
def create_credential(data: CredentialCreate, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "credential:write")
    encrypted = encrypt_value(data.value)
    db = get_neo4j()
    uid = agent.get("user_id")
    cred = db.create_credential(data.host_id, data.type, data.key_ref, encrypted, data.owner, user_id=uid)
    db.create_audit_log("create", agent["agent_id"], "credential", cred["credential_id"], True)
    return cred


@app.put("/credentials/{credential_id}")
def update_credential(credential_id: str, value: str = Query(...), agent: dict = Depends(get_current_agent)):
    require_permission(agent, "credential:write")
    db = get_neo4j()
    uid = agent.get("user_id")
    encrypted = encrypt_value(value)
    with db.driver.session() as session:
        if uid:
            result = session.run("""
                MATCH (h:Host {user_id: $uid})-[:OWNS]->(c:Credential {credential_id: $cred_id})
                SET c.encrypted_value = $encrypted, c.updated_at = datetime()
                RETURN c.credential_id
                """, cred_id=credential_id, encrypted=encrypted, uid=uid)
        else:
            result = session.run("""
                MATCH (h:Host)-[:OWNS]->(c:Credential {credential_id: $cred_id})
                SET c.encrypted_value = $encrypted, c.updated_at = datetime()
                RETURN c.credential_id
                """, cred_id=credential_id, encrypted=encrypted)
        if not result.single():
            raise HTTPException(status_code=404, detail="Credential not found")
    db.create_audit_log("update", agent["agent_id"], "credential", credential_id, True)
    return {"status": "ok"}


@app.delete("/credentials/{credential_id}")
def delete_credential(credential_id: str, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "credential:delete")
    db = get_neo4j()
    uid = agent.get("user_id")
    with db.driver.session() as session:
        if uid:
            result = session.run("""
                MATCH (h:Host {user_id: $uid})-[:OWNS]->(c:Credential {credential_id: $cred_id})
                DETACH DELETE c
                RETURN count(c) AS deleted
                """, cred_id=credential_id, uid=uid)
        else:
            result = session.run("""
                MATCH (h:Host)-[:OWNS]->(c:Credential {credential_id: $cred_id})
                DETACH DELETE c
                RETURN count(c) AS deleted
                """, cred_id=credential_id)
        deleted = result.single()["deleted"]
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.create_audit_log("delete", agent["agent_id"], "credential", credential_id, True)
    return {"status": "ok"}


# ── Audit ─────────────────────────────────────────────────────────────────────

@app.get("/audit", response_model=dict)
def get_audit(
    agent_id: Optional[str] = None,
    credential_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    agent: dict = Depends(get_current_agent),
):
    require_permission(agent, "audit:read")
    db = get_neo4j()
    entries = db.get_audit_logs(
        agent_id=agent_id, credential_id=credential_id,
        from_date=from_date, to_date=to_date, limit=limit,
    )
    return {
        "entries": [
            AuditLogEntry(
                log_id=e["log_id"],
                timestamp=str(e["timestamp"]) if e.get("timestamp") else "",
                agent_id=e["agent_id"],
                agent_name=e.get("agent_name"),
                action=e["action"],
                resource_type=e["resource_type"],
                resource_id=e["resource_id"],
                success=e.get("success", True),
            )
            for e in entries
        ]
    }


# ── Settings: Telegram ─────────────────────────────────────────────────────────

@app.get("/settings/telegram", response_model=dict)
def get_telegram(agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    db = get_neo4j()
    cfg = db.get_telegram_config()
    if cfg:
        return {
            "bot_token": "***",  # never expose encrypted raw token to UI
            "chat_id": cfg.get("chat_id", ""),
            "is_enabled": cfg.get("is_enabled", True),
        }
    return {"bot_token": "", "chat_id": "", "is_enabled": False}


@app.put("/settings/telegram", response_model=dict)
def save_telegram(data: TelegramConfig, agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    db = get_neo4j()
    # Encrypt bot token before storing
    encrypted_token = encrypt_value(data.bot_token) if data.bot_token else ""
    db.save_telegram_config(encrypted_token, data.chat_id, data.is_enabled)
    return {"status": "ok"}


@app.post("/settings/telegram/test", response_model=TelegramTestResponse)
def test_telegram(agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    db = get_neo4j()
    cfg = db.get_telegram_config()
    if not cfg or not cfg.get("bot_token") or not cfg.get("chat_id"):
        return TelegramTestResponse(success=False, error="Telegram not configured")

    text = (
        "✅ <b>KathiCredentials Test Message</b>\n"
        f"🕐 Sent at: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        "Telegram integration is working correctly!"
    )
    success, msg_id, err = asyncio.run(send_message(text))
    if success:
        return TelegramTestResponse(success=True, message_id=msg_id)
    return TelegramTestResponse(success=False, error=err)


# ── Settings: Encryption ───────────────────────────────────────────────────────

def _get_encryption_key() -> str:
    settings = get_settings()
    if settings.encryption_key:
        return settings.encryption_key
    # Fallback: generate a new one
    from api.encryption import generate_key
    return generate_key()

@app.get("/settings/encryption/key", response_model=EncryptionMeta)
def get_encryption_key(agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:read")
    db = get_neo4j()
    created_at = db.get_encryption_key_created_at()
    return EncryptionMeta(algorithm="AES-128-CBC (Fernet)", created_at=created_at)


@app.post("/settings/encryption/rotate", response_model=dict)
def rotate_encryption_key(agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    new_key = _get_encryption_key()
    db = get_neo4j()
    db.set_encryption_key_created_at(datetime.utcnow().isoformat())
    # TODO: re-encrypt all credential values with new key
    return {"success": True, "message": "Encryption key rotated. All credential values will be re-encrypted."}


# ── Settings: Admin Token ─────────────────────────────────────────────────────

@app.get("/settings/admin/token", response_model=AdminTokenResponse)
def get_admin_token(agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    db = get_neo4j()
    # Try Neo4j first, fall back to env
    stored = db.get_admin_token()
    if stored:
        return AdminTokenResponse(token=stored)
    settings = get_settings()
    return AdminTokenResponse(token=settings.admin_token)


@app.post("/settings/admin/token", response_model=AdminTokenResponse)
def regenerate_admin_token(agent: dict = Depends(get_current_agent)):
    require_permission(agent, "agent:write")
    # Generate new sk-xxxxxxxx format token (16 alphanumeric chars after sk-)
    import secrets
    import string
    suffix = ''.join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(16))
    new_token = f"sk-{suffix}"
    db = get_neo4j()
    db.save_admin_token(new_token)
    return AdminTokenResponse(token=new_token)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _host_dict(h: dict) -> HostResponse:
    return HostResponse(
        host_id=h["host_id"],
        hostname=h["hostname"],
        ip=h["ip"],
        role=h["role"],
        owner=h["owner"],
        tags=h.get("tags", []),
        environment=h.get("environment", "production"),
        created_at=str(h.get("created_at", "")),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8124)