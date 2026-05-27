# KathiCredentials — Agent Onboarding Guide

## Overview

`KathiCredentials` is a centralized credential & host management system for AI agents with Keycloak-based multi-user isolation. Each user has their own credentials and hosts, fully isolated from other users.

**Architecture:**
- **Auth**: Keycloak (OIDC) — users log in with username/password
- **Storage**: Neo4j (per-user data isolation via `user_id` field on all nodes)
- **API**: FastAPI on port `8124` — Bearer token (Keycloak access_token)
- **UI**: React SPA on port `3001`

---

## Quick Start

### 1. Login

```
POST http://100.68.243.11:8124/users/login
Content-Type: application/json

{"username": "doi", "password": "test123"}
```

Response:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 300
}
```

### 2. Use token for API calls

```bash
export TOKEN="eyJhbGciOiJSUzI1NiIs..."
export API="http://100.68.243.11:8124"

# List your credentials
curl -H "Authorization: Bearer $TOKEN" $API/credentials

# List your hosts
curl -H "Authorization: Bearer $TOKEN" $API/hosts

# Create a host
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"web-prod","ip_address":"1.2.3.4","port":22,"ssh_user":"ubuntu"}' \
  $API/hosts

# Create a credential
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"prod-ssh-key","type":"ssh_key","credential_data":{"private_key":"..."}}' \
  $API/credentials
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users/login` | Login with Keycloak username/password → access_token |
| GET | `/users/me` | Get current user info |
| GET | `/auth/session` | Validate session token |

### Credentials
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/credentials` | List your credentials (no values) |
| GET | `/credentials/{id}` | Get credential WITH decrypted value → 🔔 Telegram notify |
| POST | `/credentials` | Create credential |
| PUT | `/credentials/{id}` | Update credential |
| DELETE | `/credentials/{id}` | Delete credential |

### Hosts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/hosts` | List your hosts |
| GET | `/hosts/{id}` | Get host details |
| POST | `/hosts` | Create host |
| PUT | `/hosts/{id}` | Update host |
| DELETE | `/hosts/{id}` | Delete host |

### Users (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | List all users (Keycloak) |
| POST | `/users` | Create user |
| DELETE | `/users/{id}` | Delete user |
| POST | `/users/{id}/reset-password` | Reset user password |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settings` | Get all settings (telegram, encryption, admin token) |
| PUT | `/settings/telegram` | Update Telegram config |
| POST | `/settings/telegram/test` | Send test message |
| PUT | `/settings/encryption` | Update encryption key |
| POST | `/settings/encryption/rotate` | Rotate encryption key |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (Neo4j, Telegram) |
| GET | `/audit-logs` | Get audit logs |

---

## Credential Types & Schemas

| Type | credential_data fields |
|------|------------------------|
| `ssh_key` | `private_key`, `passphrase` (optional), `ssh_user`, `port` (optional) |
| `password` | `username`, `password`, `host`, `port` (optional) |
| `api_key` | `api_url`, `api_key`, `secret` (optional) |
| `token` | `token`, `token_type` (optional) |
| `certificate` | `cert`, `key`, `ca_cert` (optional) |
| `other` | any key-value pairs |

---

## Data Isolation

**All data is per-user isolated.** Every node in Neo4j has a `user_id` field matching the Keycloak user ID (UUID). API queries automatically filter by the authenticated user's ID.

Example: When user `doi` (UUID: `f22270dc-...`) calls `GET /credentials`, the query returns only credentials where `user_id = f22270dc-...`. User `user2` cannot see or access `doi`'s credentials.

---

## Response Format

**Success:**
```json
{"success": true, "data": {...}}
```

**Error:**
```json
{"success": false, "error": "Error message"}
```

---

## Keycloak Admin (User Management)

Keycloak is running at `http://100.68.243.11:8080`. Admin console: `http://100.68.243.11:8080/admin/kathi/console`

**Admin credentials:** `admin` / `kc-admin-2026`

User management is done via the Keycloak Admin API (aliased through the KathiCredentials `/users/*` endpoints).

---

## Service Info

| Service | URL |
|---------|-----|
| API | http://100.68.243.11:8124 |
| UI | http://100.68.243.11:3001 |
| Keycloak | http://100.68.243.11:8080 |
| Neo4j | bolt://localhost:7688 |

**GitHub:** https://github.com/n00n0i/kathi-credentials

---

## Troubleshooting

### "Invalid token"
- Your Keycloak access_token may have expired (5 min lifetime). Re-login with `POST /users/login`.

### "Permission denied"
- User doesn't have admin permissions for that operation.

### "Connection refused"
- API server may be restarting. Retry after 5s. Check `GET /health`.