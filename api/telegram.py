import asyncio
import logging
from datetime import datetime
from typing import Optional

import httpx
from api.config import get_settings

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"


async def send_message(text: str) -> tuple[bool, Optional[int], Optional[str]]:
    """Send a Telegram message. Returns (success, message_id, error)."""
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return False, None, "Telegram not configured (missing bot_token or chat_id)"

    url = f"{TELEGRAM_API}/bot{settings.telegram_bot_token}/sendMessage"
    payload = {
        "chat_id": settings.telegram_chat_id,
        "text": text,
        "parse_mode": "HTML",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()
            if data.get("ok"):
                return True, data["result"]["message_id"], None
            else:
                return False, None, data.get("description", "Unknown error")
    except Exception as e:
        return False, None, str(e)


def format_credential_access_message(
    agent_name: str,
    credential_type: str,
    hostname: str,
    credential_id: str,
) -> str:
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    return (
        f"🤖 <b>Credential Accessed</b>\n"
        f"👤 Agent: <code>{agent_name}</code>\n"
        f"🔑 Type: <code>{credential_type}</code>\n"
        f"🖥️ Host: <code>{hostname}</code>\n"
        f"🔖 Cred ID: <code>{credential_id}</code>\n"
        f"🕐 Time: {ts}"
    )


async def notify_credential_access(
    agent_name: str,
    credential_type: str,
    hostname: str,
    credential_id: str,
) -> tuple[bool, Optional[str]]:
    """
    Send Telegram notification when an agent accesses a credential.
    Called inside get_credential() — every time.
    """
    text = format_credential_access_message(
        agent_name, credential_type, hostname, credential_id
    )
    success, msg_id, err = await send_message(text)
    if not success:
        logger.warning(f"Telegram notification failed: {err}")
    return success, err