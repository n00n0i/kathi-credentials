# KathiCredentials MCP — Specification

## Overview
Standalone credential & host management MCP for AI agents. Agents authenticate via token, query hosts/credentials, and admin receives Telegram notifications on every credential access.

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  AI Agent   │────▶│ KathiCredentials  │────▶│  Neo4j      │
│  (REST/MCP) │     │  FastAPI :8124    │     │  bolt:7688  │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌───────────────┐     ┌─────────────┐
                    │ Keycloak      │     │ Telegram    │
                    │ :8080         │────▶│ Bot → Admin │
                    │ (auth+users)  │     │ DM          │
                    └───────────────┘     └─────────────┘
```

**Auth flow:** Keycloak OIDC → access_token (JWT) → Bearer header on all API calls
**Data isolation:** `user_id` field on all Neo4j nodes (Keycloak UUID per user)

---

## Neo4j Schema

### Nodes

| Node | Properties |
|------|------------|
| `Host` | `host_id`, `name`, `ip_address`, `port`, `ssh_user`, `ssh_note`, `environment`, `tags: List[str]`, `user_id`, `created_at`, `updated_at` |
| `Credential` | `credential_id`, `name`, `type` (ssh_key/password/api_key/token/certificate/other), `credential_data` (encrypted JSON), `host_id`, `user_id`, `created_at`, `updated_at` |
| `AuditLog` | `log_id`, `action`, `user_id`, `resource_type`, `resource_id`, `details`, `timestamp` |
| `Session` | `session_token`, `user_id`, `expires_at`, `is_active`, `created_at` |

### Relationships

```
(User) ─[OWNS]──▶ (Host)
(User) ─[OWNS]──▶ (Credential)
(User) ─[HAS]────▶ (Session)
(AuditLog) ─[BY]─▶ (User)
(AuditLog) ─[ON]─▶ (Credential|Host)
(Host) ─[HAS]────▶ (Credential)
```

> Note: In this implementation, ownership is via `user_id` field (not Cypher relationships) for simpler queries and per-user isolation.

---

## API Endpoints (FastAPI)

All endpoints require `Authorization: Bearer <access_token>` header (Keycloak JWT).

### Auth
- `POST /users/login` — Login with Keycloak username/password → `{access_token, token_type, expires_in}`
- `GET /users/me` — Get current user info
- `GET /auth/session` — Validate current session

### Session Architecture (Browser UI)
Browser sessions use Keycloak access_token stored in `localStorage` as `session_session_token`. No separate session tokens — the Keycloak JWT itself is used for all authenticated requests.

### Hosts
- `GET /hosts` — List user's hosts (filtered by `user_id` from JWT)
- `GET /hosts/{host_id}` — Get host detail
- `GET /hosts/search?q=` — Search hosts by name/IP
- `POST /hosts` — Create host
- `PUT /hosts/{host_id}` — Update host
- `DELETE /hosts/{host_id}` — Delete host

### Credentials
- `GET /credentials?host_id=` — List credentials for host (NO values)
- `GET /credentials/{credential_id}` — Get credential WITH decrypted value → 🔔 Telegram notify
- `POST /credentials` — Create credential
- `PUT /credentials/{credential_id}` — Update credential
- `DELETE /credentials/{credential_id}` — Delete credential

### Users (Admin only via Keycloak Admin API)
- `GET /users` — List all users
- `POST /users` — Create user
- `DELETE /users/{user_id}` — Delete user
- `POST /users/{user_id}/reset-password` — Reset user password

### Settings (Admin only)
- `GET /settings` — Get all settings (telegram, encryption, admin_token)
- `PUT /settings/telegram` — Update Telegram config
- `POST /settings/telegram/test` — Send test message
- `PUT /settings/encryption` — Update encryption key metadata
- `POST /settings/encryption/rotate` — Rotate encryption key (re-encrypt all credentials)

### System
- `GET /health` — Health check (neo4j, telegram)
- `GET /audit-logs?limit=` — Get audit logs

---

## MCP Tools

### authenticate(token: string) → { valid, agent_id, name, permissions, expires_at }
### list_hosts(tags?: string[], role?: string) → Host[]
### search_hosts(query: string) → Host[]
### get_host(host_id: string) → Host
### create_host(hostname, ip, role, owner, tags, environment) → host_id
### list_credentials(host_id: string) → Credential[] (NO values)
### get_credential(credential_id: string) → { type, key_ref, value }
  → Triggers Telegram notification to admin
### create_credential(host_id, type, key_ref, value, owner) → credential_id
### update_credential(credential_id, value) → OK
### delete_credential(credential_id) → OK
### get_audit_log(credential_id?, agent_id?, from?, to?) → AuditEntry[]
### create_agent(name, permissions) → { agent_id, token }
### revoke_agent(agent_id) → OK

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEO4J_URI` | bolt://localhost:7688 |
| `NEO4J_USER` | neo4j |
| `NEO4J_PASSWORD` | experience123 |
| `ENCRYPTION_KEY` | Fernet key (44 chars, base64, auto-generated if not set) |
| `ADMIN_TOKEN` | Auto-generated on startup if not provided |
| `JWT_SECRET` | Secret for JWT signing (default: dev-jwt-secret-change-me) |
| `SESSION_EXPIRY_DAYS` | Browser session expiry (default: 7 days) |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Admin's Telegram chat ID |
| `API_PORT` | Default 8124 |
| `LOG_LEVEL` | INFO (default) |

---

## Tech Stack

- **MCP Server**: FastMCP (Python)
- **API**: FastAPI + uvicorn
- **Graph DB**: Neo4j 5.15.0 (existing `experience-neo4j` container)
- **Encryption**: `cryptography.fernet` (AES-128)
- **Notification**: Telegram Bot API (`python-telegram-bot`)
- **Frontend**: React (Vite, TypeScript) — standalone SPA
- **Container**: Docker + Docker Compose

---

## Project Structure

```
/root/kathi-credentials/
├── SPEC.md
├── README.md
├── requirements.txt
├── docker-compose.yml
├── .env.example
├── api/
│   ├── __init__.py
│   ├── main.py              # FastAPI app + routes
│   ├── auth.py              # Token authentication
│   ├── encryption.py        # Fernet encrypt/decrypt
│   ├── neo4j_client.py      # Neo4j connection + queries
│   ├── telegram.py          # Telegram notification
│   ├── models.py            # Pydantic models
│   └── mcp_server.py        # MCP tool definitions
├── ui/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── components/
│   │   │   ├── TelegramSettings.tsx
│   │   │   ├── EncryptionSettings.tsx
│   │   │   ├── AdminTokenSettings.tsx
│   │   │   ├── AgentsSettings.tsx
│   │   │   ├── AuditLogSettings.tsx
│   │   │   └── SystemHealth.tsx
│   │   ├── api/
│   │   │   └── settingsApi.ts
│   │   └── styles/
│   │       └── settings.css
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── tests/
    ├── test_auth.py
    ├── test_credentials.py
    └── test_mcp.py
```

---

## Settings Page — UI Sections

### 1. Telegram
- Bot Token input + save button
- Chat ID input + save button
- "Send Test Message" button → green check on success
- Enable/Disable toggle

### 2. Encryption
- Current key metadata (created date, algorithm)
- "Rotate Key" button → generates new Fernet key
- Warning: "Rotating key will re-encrypt all credentials"

### 3. Admin Token
- Masked current token (last 8 chars visible)
- "Regenerate" button → confirmation dialog
- "Copy Token" button

### 4. Agents
- Table: Agent Name | Permissions | Token (masked) | Created | Status | Actions
- "Create Agent" button → modal with name + permissions checkboxes
- Revoke button per row

### 5. Audit Log
- Date range picker (from/to)
- Filter by agent / credential
- Table: Timestamp | Agent | Action | Resource | Success
- "Export CSV" button

### 6. System
- Health status cards: Neo4j ✅/❌, Telegram ✅/❌
- Version info
- Uptime
- "Restart Service" button

---

## Status
- [x] SPEC.md written
- [x] Phase 1: Project setup (docker-compose, requirements, env)
- [x] Phase 2: Neo4j schema + encryption module + auth token system
- [x] Phase 3: MCP server + API endpoints + Telegram integration
- [x] Settings Page (UI) — all tabs working
- [x] Session auth: Keycloak OIDC, browser sessions via localStorage
- [x] Phase 4: AGENTS.md + SPEC.md updated (Keycloak auth, per-user isolation)
- [x] E2E test script — 15/15 API tests passed
- [x] Browser E2E — 5/5 flow tests passed (Login, Host CRUD, Credential CRUD, Users)
- [x] k8: Deploy to Oracle Cloud (API:8124, UI:3001) + tab navigation fix