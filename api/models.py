from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    token: str


class AuthResponse(BaseModel):
    valid: bool
    agent_id: Optional[str] = None
    name: Optional[str] = None
    permissions: list[str] = []
    expires_at: Optional[str] = None


class LoginRequest(BaseModel):
    token: str  # admin token (sk-xxx...)


class LoginResponse(BaseModel):
    session_token: str
    expires_at: str  # ISO8601
    name: str
    permissions: list[str]


class SessionInfo(BaseModel):
    session_token: str
    expires_at: str
    name: str
    permissions: list[str]


class LogoutResponse(BaseModel):
    ok: bool


# ── Agent ─────────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    permissions: list[str]


class AgentResponse(BaseModel):
    agent_id: str
    name: str
    permissions: list[str]
    token: str  # shown only once on creation
    created_at: str


class AgentListItem(BaseModel):
    agent_id: str
    name: str
    permissions: list[str]
    token_preview: str
    created_at: str
    is_active: bool


# ── Host ─────────────────────────────────────────────────────────────────────

class HostCreate(BaseModel):
    hostname: str
    ip: str
    role: str
    owner: str
    tags: list[str] = []
    environment: str = "production"


class HostUpdate(BaseModel):
    hostname: Optional[str] = None
    ip: Optional[str] = None
    role: Optional[str] = None
    owner: Optional[str] = None
    environment: Optional[str] = None
    tags: Optional[list[str]] = None


class HostResponse(BaseModel):
    host_id: str
    hostname: str
    ip: str
    role: str
    owner: str
    tags: list[str]
    environment: str
    created_at: str


# ── Credential ────────────────────────────────────────────────────────────────

class CredentialCreate(BaseModel):
    host_id: str
    type: str = Field(description="api_key | password | token | ssh_key")
    key_ref: str
    name: str = ""
    value: str
    owner: str = ""
    environment: str = ""


class CredentialListItem(BaseModel):
    credential_id: str
    name: str
    type: str
    key_ref: str
    host_id: str
    hostname: str
    environment: str
    owner: str
    created_at: str


class CredentialWithValue(BaseModel):
    credential_id: str
    type: str
    key_ref: str
    value: str
    owner: str


# ── Audit ─────────────────────────────────────────────────────────────────────

class AuditLogEntry(BaseModel):
    log_id: str
    timestamp: str
    agent_id: str
    agent_name: Optional[str]
    action: str
    resource_type: str
    resource_id: str
    success: bool


# ── Telegram ───────────────────────────────────────────────────────────────────

class TelegramConfig(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    is_enabled: bool = True


class TelegramTestResponse(BaseModel):
    success: bool
    message_id: Optional[int] = None
    error: Optional[str] = None


# ── Settings ─────────────────────────────────────────────────────────────────

class EncryptionMeta(BaseModel):
    algorithm: str = "AES-128-CBC (Fernet)"
    created_at: Optional[str] = None


class AdminTokenResponse(BaseModel):
    token: str


class HealthResponse(BaseModel):
    status: str  # healthy | degraded | down
    neo4j: str   # connected | disconnected
    telegram: str  # connected | not_configured | error
    uptime_seconds: int
    version: str
    total_credentials: int
    total_hosts: int
    total_agents: int


# ── Keycloak User Management ───────────────────────────────────────────────────

class UserLoginRequest(BaseModel):
    """Username + password login (Keycloak password grant)"""
    username: str
    password: str


class UserLoginResponse(BaseModel):
    """Returns access_token + session info after Keycloak auth"""
    access_token: str
    refresh_token: Optional[str] = None
    expires_in: int
    user_id: str
    username: str
    email: str
    first_name: str
    last_name: str


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    enabled: bool = True


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    enabled: Optional[bool] = None


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    enabled: bool
    created_at: Optional[str | int] = None


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int