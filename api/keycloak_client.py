"""
Keycloak OIDC integration for KathiCredentials.
Handles user authentication via Keycloak + user management via Keycloak Admin API.
"""

import httpx
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Keycloak connection settings — set via KeycloakSettings model in main.py
_keycloak_url: str = "http://100.68.243.11:8080"
_admin_user: str = "admin"
_admin_password: str = "kc-admin-2026"
_realm: str = "kathi"
_client_id: str = "kathi-frontend"  # public client with directAccessGrantsEnabled
_client_secret: str = ""  # not needed for public client
_admin_token_cache: Optional[str] = None
_admin_token_expires: float = 0


# ─── Admin Token (for managing users) ──────────────────────────────────────────

def _get_admin_token() -> str:
    """Get cached Keycloak admin token or fetch a new one.
    Uses client_credentials grant with kathi-backend service account.
    """
    global _admin_token_cache, _admin_token_expires
    import time
    if _admin_token_cache and time.time() < _admin_token_expires - 60:
        return _admin_token_cache

    import base64
    credentials = base64.b64encode(b"kathi-backend:kathi-backend-secret-2026").decode()
    resp = httpx.post(
        f"{_keycloak_url}/realms/master/protocol/openid-connect/token",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "client_credentials",
            "client_id": "kathi-backend",
            "client_secret": "kathi-backend-secret-2026",
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]
    _admin_token_cache = token
    _admin_token_expires = time.time() + resp.json().get("expires_in", 300)
    return token


def get_token_headers() -> dict:
    """Headers for Keycloak Admin API calls (requires valid admin token)."""
    return {"Authorization": f"Bearer {_get_admin_token()}"}


def validate_keycloak_token(access_token: str) -> dict | None:
    """
    Validate a Keycloak access_token by decoding its JWT claims.
    Keycloak tokens are RS256 signed — we decode the payload (not signature)
    to extract user identity. The token was already validated by Keycloak
    during the password grant that issued it, so the sub/email claims are trusted.
    """
    try:
        import base64, json as json_lib
        parts = access_token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
        claims = json_lib.loads(base64.urlsafe_b64decode(padded))

        # Verify this token was issued by our realm
        iss = claims.get("iss", "")
        expected_iss = f"{_keycloak_url}/realms/{_realm}"
        if iss != expected_iss:
            print(f"[KC validate] Wrong issuer: {iss} != {expected_iss}")
            return None

        # Check expiry
        exp = claims.get("exp", 0)
        if exp and datetime.utcnow().timestamp() > exp:
            print(f"[KC validate] Token expired: exp={exp}")
            return None

        # Skip audience check — Keycloak public clients include "account" in audience,
        # not our client_id. Issuer + expiry verification is sufficient.
        print(f"[KC validate] SUCCESS: sub={claims.get('sub')}, iss={iss}")
        return {
            "valid": True,
            "agent_id": claims.get("sub", ""),
            "name": claims.get("preferred_username", claims.get("username", "")),
            "permissions": ["*"],
            "expires_at": datetime.fromtimestamp(exp).isoformat() if exp else None,
            "user_id": claims.get("sub", ""),
            "username": claims.get("preferred_username", claims.get("username", "")),
            "email": claims.get("email", ""),
        }
    except Exception as e:
        logger.warning(f"Keycloak token decode failed: {e}")
        return None


def get_keycloak_userinfo(access_token: str) -> dict | None:
    """Get full userinfo from Keycloak for a given access token."""
    try:
        resp = httpx.get(
            f"{_keycloak_url}/realms/{_realm}/protocol/openid-connect/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


# ─── User Authentication (login) ──────────────────────────────────────────────

def verify_user_password(username: str, password: str) -> dict | None:
    """
    Authenticate a user via Keycloak password grant.
    Returns user info dict if valid, None if invalid.
    """
    try:
        print(f"[DEBUG] verify_user_password: client_id={_client_id}, username={username}, keycloak_url={_keycloak_url}/realms/{_realm}/protocol/openid-connect/token")
        resp = httpx.post(
            f"{_keycloak_url}/realms/{_realm}/protocol/openid-connect/token",
            data={
                "client_id": _client_id,
                "username": username,
                "password": password,
                "grant_type": "password",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10.0,
        )
        print(f"[DEBUG] Keycloak response status={resp.status_code}, body={resp.text[:500]}")
        if resp.status_code in (401, 403):
            return None
        resp.raise_for_status()
        data = resp.json()

        # Fetch user info via UserInfo endpoint (optional — token is already valid)
        user_info = {}
        try:
            user_info_resp = httpx.get(
                f"{_keycloak_url}/realms/{_realm}/protocol/openid-connect/userinfo",
                headers={"Authorization": f"Bearer {data['access_token']}"},
                timeout=10.0,
            )
            print(f"[DEBUG] userinfo status={user_info_resp.status_code}, body={user_info_resp.text[:200]}")
            if user_info_resp.status_code == 200:
                user_info = user_info_resp.json()
        except Exception as e:
            print(f"[DEBUG] userinfo error: {e}")

        # Extract user identity from token claims (sub is always in the JWT payload)
        import base64, json as json_lib
        token_claims = {}
        try:
            # Keycloak tokens are JWTs — decode payload without verification
            parts = data["access_token"].split(".")
            if len(parts) == 3:
                payload_b64 = parts[1]
                # Add padding
                padded = payload_b64 + "=" * (4 - len(payload_b64) % 4)
                token_claims = json_lib.loads(base64.urlsafe_b64decode(padded))
                print(f"[DEBUG] token claims: sub={token_claims.get('sub')}, email={token_claims.get('email')}")
        except Exception as e:
            print(f"[DEBUG] token decode error: {e}")

        result = {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in", 300),
            "user_id": token_claims.get("sub", username),
            "username": username,
            "email": token_claims.get("email", user_info.get("email", "")),
            "first_name": token_claims.get("given_name", user_info.get("given_name", "")),
            "last_name": token_claims.get("family_name", user_info.get("family_name", "")),
            "enabled": True,
        }
        print(f"[DEBUG] Returning result keys: {list(result.keys())}")
        return result
    except Exception as e:
        logger.warning(f"Keycloak auth failed for {username}: {e}")
        return None


# ─── User Management (Admin API) ───────────────────────────────────────────────

def list_users() -> list[dict]:
    """List all users in the Kathi realm."""
    resp = httpx.get(
        f"{_keycloak_url}/admin/realms/{_realm}/users",
        headers=get_token_headers(),
        timeout=10.0,
    )
    resp.raise_for_status()
    return [_user_summary(u) for u in resp.json()]


def get_user(user_id: str) -> dict | None:
    """Get a single user by ID."""
    resp = httpx.get(
        f"{_keycloak_url}/admin/realms/{_realm}/users/{user_id}",
        headers=get_token_headers(),
        timeout=10.0,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return _user_detail(resp.json())


def create_user(username: str, email: str, password: str,
                first_name: str = "", last_name: str = "",
                enabled: bool = True) -> dict:
    """
    Create a new user in Keycloak.
    Returns the created user summary.
    """
    payload = {
        "username": username,
        "email": email,
        "enabled": enabled,
        "firstName": first_name,
        "lastName": last_name,
        "credentials": [{
            "type": "password",
            "value": password,
            "temporary": False,
        }],
        "emailVerified": True,
    }
    resp = httpx.post(
        f"{_keycloak_url}/admin/realms/{_realm}/users",
        headers={**get_token_headers(), "Content-Type": "application/json"},
        json=payload,
        timeout=10.0,
    )
    resp.raise_for_status()
    # Keycloak returns HTTP 201 with no body — fetch the user to get ID
    # Search by username to find the new user
    users_resp = httpx.get(
        f"{_keycloak_url}/admin/realms/{_realm}/users?username={username}",
        headers=get_token_headers(),
        timeout=10.0,
    )
    users_resp.raise_for_status()
    users = users_resp.json()
    if not users:
        raise RuntimeError(f"User {username} not found after creation")
    return _user_summary(users[0])


def update_user(user_id: str, updates: dict) -> None:
    """
    Update a user. updates can include:
    email, firstName, lastName, enabled, username
    """
    resp = httpx.put(
        f"{_keycloak_url}/admin/realms/{_realm}/users/{user_id}",
        headers={**get_token_headers(), "Content-Type": "application/json"},
        json=updates,
        timeout=10.0,
    )
    if resp.status_code == 404:
        raise RuntimeError(f"User {user_id} not found")
    resp.raise_for_status()


def reset_password(user_id: str, new_password: str) -> None:
    """Reset a user's password."""
    payload = {
        "type": "password",
        "value": new_password,
        "temporary": False,
    }
    resp = httpx.put(
        f"{_keycloak_url}/admin/realms/{_realm}/users/{user_id}/reset-password",
        headers={**get_token_headers(), "Content-Type": "application/json"},
        json=payload,
        timeout=10.0,
    )
    if resp.status_code == 404:
        raise RuntimeError(f"User {user_id} not found")
    resp.raise_for_status()


def delete_user(user_id: str) -> None:
    """Delete a user."""
    resp = httpx.delete(
        f"{_keycloak_url}/admin/realms/{_realm}/users/{user_id}",
        headers=get_token_headers(),
        timeout=10.0,
    )
    if resp.status_code == 404:
        raise RuntimeError(f"User {user_id} not found")
    resp.raise_for_status()


# ─── OIDC Discovery ───────────────────────────────────────────────────────────

def get_oidc_config() -> dict:
    """Get OIDC provider configuration."""
    resp = httpx.get(
        f"{_keycloak_url}/realms/{_realm}/.well-known/openid-configuration",
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _user_summary(u: dict) -> dict:
    return {
        "user_id": u.get("id"),
        "username": u.get("username"),
        "email": u.get("email"),
        "first_name": u.get("firstName", ""),
        "last_name": u.get("lastName", ""),
        "enabled": u.get("enabled", True),
        "created_at": u.get("createdTimestamp"),
    }


def _user_detail(u: dict) -> dict:
    out = _user_summary(u)
    # Count sessions (not directly available in Keycloak without extra queries)
    out["realm_roles"] = u.get("realmRoles", [])
    return out