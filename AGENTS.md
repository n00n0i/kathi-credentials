# KathiCredentials — Agent Onboarding Guide

## Overview

`KathiCredentials` is a centralized credential and host management system for AI agents. Each agent gets its own **agent token** and a **setup link** that provides all necessary configuration to auto-onboard.

---

## Quick Onboarding

When you receive a setup link, fetch it to get your configuration:

```
GET https://<API_SERVER>/mcp/setup?agent_token=<YOUR_TOKEN>
```

The server returns a JSON response with your agent ID, permissions, and API endpoints.

---

## Setup Endpoint Response Format

```json
{
  "agent_id": "a1b2c3d4-e5f6-...",
  "name": "my-agent-name",
  "permissions": ["credentials:read", "credentials:create", "hosts:read"],
  "api_url": "http://100.68.243.11:8124",
  "mcp_endpoint": "http://100.68.243.11:8124/mcp/sse",
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
    "get_system_health"
  ]
}
```

---

## MCP Server Connection (SSE Transport)

### Python (`mcp` library)

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import asyncio

async def main():
    server_params = StdioServerParameters(
        command="python",
        args=["-m", "mcp.server.fastmcp"],
        env={
            "MCP_SERVER_URL": "http://100.68.243.11:8124/mcp/sse",
            "AGENT_TOKEN": "<YOUR_TOKEN>"
        }
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            # List available tools
            tools = await session.list_tools()
            print(tools)
            # Call a tool
            result = await session.call_tool("list_credentials", {})
            print(result)

asyncio.run(main())
```

### JavaScript/TypeScript (`@modelcontextprotocol/sdk`)

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "python",
  args: ["-m", "mcp.server.fastmcp"],
  env: {
    "MCP_SERVER_URL": "http://100.68.243.11:8124/mcp/sse",
    "AGENT_TOKEN": "<YOUR_TOKEN>"
  }
});

const client = new Client({ name: "my-agent", version: "1.0.0" }, {
  capabilities: { tools: {} }
});

await client.connect(transport);
const tools = await client.listTools();
console.log(tools);
```

---

## Direct REST API Usage

All MCP tools are also available via REST API with Bearer token auth:

```bash
# Set your token
export AGENT_TOKEN="<YOUR_TOKEN>"
export API_URL="http://100.68.243.11:8124"

# List credentials
curl -H "Authorization: Bearer $AGENT_TOKEN" \
     "$API_URL/api/credentials"

# Get specific credential
curl -H "Authorization: Bearer $AGENT_TOKEN" \
     "$API_URL/api/credentials/<CREDENTIAL_ID>"

# Create credential
curl -X POST -H "Authorization: Bearer $AGENT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"My DB","type":"postgres","host_id":"<HOST_ID>","credential_data":{"host":"db.example.com","port":5432,"database":"mydb,"username":"admin","password":"secret"}}' \
     "$API_URL/api/credentials"

# Rotate credential
curl -X POST -H "Authorization: Bearer $AGENT_TOKEN" \
     "$API_URL/api/credentials/<CREDENTIAL_ID>/rotate"

# List hosts
curl -H "Authorization: Bearer $AGENT_TOKEN" \
     "$API_URL/api/hosts"

# Create host
curl -X POST -H "Authorization: Bearer $AGENT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"Web Server","host_type":"vps","ip_address":"1.2.3.4","port":22,"ssh_user":"ubuntu","ssh_note":"Prod webserver"}' \
     "$API_URL/api/hosts"

# Get audit logs (admin only)
curl -H "Authorization: Bearer $AGENT_TOKEN" \
     "$API_URL/api/audit-logs?limit=50"

# System health (admin only)
curl -H "Authorization: Bearer $AGENT_TOKEN" \
     "$API_URL/api/health"
```

---

## Credential Types & Data Schemas

| Type | Fields in `credential_data` |
|------|---------------------------|
| `postgres` | `host`, `port`, `database`, `username`, `password` |
| `mysql` | `host`, `port`, `database`, `username`, `password` |
| `redis` | `host`, `port`, `password` (optional `db`) |
| `ssh` | `host`, `port`, `username`, `password` OR `private_key` |
| `api_key` | `api_url`, `api_key`, `secret` (optional) |
| `aws` | `aws_access_key_id`, `aws_secret_access_key`, `region` |
| `custom` | any key-value pairs |

## Host Types

| Type | Description |
|------|-------------|
| `vps` | Virtual private server |
| `dedicated` | Dedicated hardware server |
| `container` | Docker container host |
| `kubernetes` | K8s cluster |
| `database` | Managed database service |
| `cloud` | Cloud provider service |
| `other` | Other host types |

---

## Response Format Convention

All API responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message description"
}
```

---

## Rate Limits

- API requests: 1000 requests/minute per agent
- SSE connections: 10 concurrent per agent

---

## Troubleshooting

### "Invalid agent token"
- Your token may have been revoked. Contact the admin.
- Token format should be: `kc_` + 43 char URL-safe string

### "Permission denied"
- Your agent doesn't have the required permission for that operation.
- Permissions are assigned by the admin when creating your agent token.

### "Connection refused" on SSE endpoint
- The API server may be restarting. Retry after 5 seconds.
- Check system health: `GET /api/health`

---

## Admin Contact

For new agent tokens or permission changes, contact the KathiCredentials admin.
