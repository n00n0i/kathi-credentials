import time
import uuid
import jwt
from jwt import ExpiredSignatureError
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Header

from api.config import get_settings
from api.neo4j_client import get_neo4j
from api.keycloak_client import validate_keycloak_token


JWT_SECRET = get_settings().jwt_secret or "dev-secret-change-me"
JWT_ALGORITHM = "HS256"
ADMIN_TOKEN_EXPIRY_HOURS = 8760  # 1 year


def create_jwt_token(agent_id: str, name: str, permissions: list[str],
                     expires_hours: int = ADMIN_TOKEN_EXPIRY_HOURS) -> str:
    payload = {
        "agent_id": agent_id,
        "name": name,
        "permissions": permissions,
        "exp": datetime.utcnow() + timedelta(hours=expires_hours),
        "iat": datetime.utcnow(),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:  # catches ExpiredSignatureError, InvalidTokenError, AlgorithmError, etc.
        return None


def validate_token(token: str) -> dict:
    """
    Validates token. Checks:
    1. Session token from Neo4j (browser session, expires)
    2. Admin token from Neo4j (stored via regenerate endpoint)
    3. Admin token from env (initial setup fallback)
    4. JWT signature (admin JWT tokens)
    5. Agent token from Neo4j

    Returns: { valid, agent_id, name, permissions, expires_at }
    """
    settings = get_settings()
    db = get_neo4j()

    # 1. KEYCLOAK TOKEN ONLY — session tokens (ses_*) are deprecated, must re-login via Keycloak
    if token.startswith("ses_"):
        return {"valid": False, "agent_id": None, "name": None,
                "permissions": [], "expires_at": None, "reason": "session_expired"}

    # 2. Admin token from Neo4j (stored via regenerate endpoint)
    stored_admin = db.get_admin_token()
    if stored_admin and token == stored_admin:
        return {
            "valid": True,
            "agent_id": "admin",
            "name": "admin",
            "permissions": ["*"],
            "expires_at": None,
        }

    # 3. Admin token from env (full access, no expiry)
    if token == settings.admin_token and settings.admin_token:
        return {
            "valid": True,
            "agent_id": "admin",
            "name": "admin",
            "permissions": ["*"],
            "expires_at": None,
        }

    # 4. Try our own JWT first
    try:
        payload = decode_jwt(token)
        if payload:
            return {
                "valid": True,
                "agent_id": payload["agent_id"],
                "name": payload["name"],
                "permissions": payload["permissions"],
                "expires_at": datetime.fromtimestamp(payload["exp"]).isoformat(),
            }
    except Exception:
        pass  # Not our JWT — fall through to try Keycloak

    # 5. Keycloak JWT — validate via Keycloak UserInfo
    print(f"[AUTH DEBUG] Trying Keycloak validation for token: {token[:30]}...")
    kc_result = validate_keycloak_token(token)
    print(f"[AUTH DEBUG] Keycloak result: {kc_result}")
    if kc_result and kc_result.get("valid"):
        return kc_result

    # 6. Agent token from Neo4j
    agent = db.get_agent_by_token(token)
    if agent:
        return {
            "valid": True,
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "permissions": agent["permissions"],
            "expires_at": agent.get("expires_at"),
        }

    return {"valid": False, "agent_id": None, "name": None,
            "permissions": [], "expires_at": None}


def get_current_agent(authorization: str = Header(...)) -> dict:
    """FastAPI dependency: validate Bearer token and return agent info."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization[7:]
    result = validate_token(token)
    if not result["valid"]:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return result


def validate_session(session_token: str) -> dict:
    """
    Validates a browser session token.
    Returns session info if valid, else {valid: False}.
    """
    db = get_neo4j()
    session = db.get_session(session_token)
    if not session:
        return {"valid": False, "agent_id": None, "name": None,
                "permissions": [], "expires_at": None}
    return {
        "valid": True,
        "agent_id": "admin",
        "name": "admin",
        "permissions": ["*"],
        "expires_at": session["expires_at"],
    }


def check_permission(permissions: list[str], required: str) -> bool:
    """Check if required permission is in the permissions list."""
    if "*" in permissions:
        return True
    # host:read allows host:write too
    prefix = required.split(":")[0]
    for p in permissions:
        if p == required:
            return True
        if p == f"{prefix}:*":
            return True
    return False


# ── Startup time for uptime calculation ───────────────────────────────────
_START_TIME = time.time()


def get_uptime_seconds() -> int:
    return int(time.time() - _START_TIME)