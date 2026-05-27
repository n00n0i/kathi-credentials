# KathiCredentials MCP — Specification

## Overview
Standalone credential & host management MCP for AI agents. Agents authenticate via token, query hosts/credentials, and admin receives Telegram notifications on every credential access.

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  AI Agent   │────▶│ KathiCredentials │────▶│  Neo4j      │
│  (MCP call) │     │  MCP Server      │     │  (bolt:7688)│
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌───────────────┐     ┌─────────────┐
                    │ Telegram Bot  │────▶│ Admin (ด๋อย)│
                    │ (notification)│     │  DM         │
                    └───────────────┘     └─────────────┘
```

---

## Neo4j Schema

### Nodes

| Node | Properties |
|------|------------|
| `Agent` | `agent_id`, `name`, `permissions: List[str]`, `created_at`, `is_active` |
| `Host` | `host_id`, `hostname`, `ip`, `role`, `owner`, `tags: List[str]`, `environment`, `created_at` |
| `Credential` | `credential_id`, `type` (api_key\|password\|token\|ssh_key), `key_ref`, `encrypted_value`, `owner`, `created_at`, `updated_at` |
| `Token` | `token_id`, `value`, `agent_id`, `permissions: List[str]`, `expires_at`, `is_active`, `created_at` |
| `AuditLog` | `log_id`, `action`, `agent_id`, `resource_type`, `resource_id`, `timestamp`, `success` |
| `TelegramConfig` | `config_id`, `bot_token`, `chat_id`, `is_enabled` |
| `Config` | `key`, `value` (admin_token, encryption_key_created_at) |
| `Session` | `session_token`, `admin_token_hash`, `expires_at`, `is_active`, `created_at` |

### Relationships

```
(Agent) ─[HAS_TOKEN]──▶ (Token)
(Agent) ─[HAS_ACCESS]──▶ (Host)
(Host) ─[OWNS]────────▶ (Credential)
(AuditLog) ─[BY]──────▶ (Agent)
(AuditLog) ─[ON]──────▶ (Credential|Host)
```

---

## API Endpoints (FastAPI)

### Auth
- `POST /auth` — Authenticate with token → { valid, agent_id, name, permissions, expires_at }
- `POST /auth/login` — Login with admin token → { session_token, expires_at, name, permissions }
- `GET /auth/session` — Validate current session → { session_token, expires_at, name, permissions }
- `POST /auth/logout` — Logout (deactivate session) → { ok }

### Session Architecture (Browser UI)
Admin tokens are stored **only in Neo4j** — never in browser localStorage. Browser sessions use short-lived `ses_xxx` tokens:

1. Docker container starts → auto-generates `sk-xxx` admin token → prints to container logs
2. User copies token from logs → pastes in UI login screen
3. Server validates admin token → creates `ses_xxx` session (7-day expiry)
4. `ses_xxx` stored in localStorage → used for all subsequent API calls
5. Switching browsers → login again with same admin token from logs

```
Token priority in validate_token():
1. ses_xxx (session token)     → Neo4j Session node, expires in 7 days
2. sk-xxx (stored admin token) → Neo4j Config node, no expiry
3. sk-xxx (env admin token)    → ADMIN_TOKEN env var, no expiry (migration fallback)
4. JWT token                   → Created for agent tokens
5. kc_xxx (agent token)       → Neo4j Token node
```

### Hosts
- `GET /hosts` — List hosts (filter by tags, role)
- `GET /hosts/search?q=` — Search hosts
- `GET /hosts/{host_id}` — Get host detail
- `POST /hosts` — Create host (admin only)
- `PUT /hosts/{host_id}` — Update host (admin only)
- `DELETE /hosts/{host_id}` — Delete host (admin only)

### Credentials
- `GET /credentials?host_id=` — List credentials for host (NO values)
- `GET /credentials/{credential_id}` — Get credential (WITH value) → 🔔 Telegram
- `POST /credentials` — Create credential (admin only)
- `PUT /credentials/{credential_id}` — Update credential (admin only)
- `DELETE /credentials/{credential_id}` — Delete credential (admin only)

### Agents
- `GET /agents` — List agents
- `POST /agents` — Create agent + token
- `DELETE /agents/{agent_id}` — Revoke agent + tokens

### Audit
- `GET /audit` — Get audit log (filter by agent_id, credential_id, from, to)

### Settings (Telegram, Encryption)
- `GET /settings/telegram` — Get Telegram config
- `PUT /settings/telegram` — Update Telegram config
- `POST /settings/telegram/test` — Send test message
- `GET /settings/encryption/key` — Show key metadata (no value)
- `POST /settings/encryption/rotate` — Rotate encryption key

### System
- `GET /health` — Health check (neo4j, telegram)

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
- [x] Session auth: admin token in Neo4j, browser sessions (ses_xxx) in localStorage
- [ ] Phase 4: AGENTS.md documentation
- [ ] E2E test script
- [ ] Upload to Central Library