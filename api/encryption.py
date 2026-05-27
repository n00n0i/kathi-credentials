import os
import uuid
import sys
from pathlib import Path

# Add parent dir to path so api module can be imported when running direct
sys.path.insert(0, str(Path(__file__).parent.parent))

from cryptography.fernet import Fernet, InvalidToken
from api.config import get_settings


def _get_fernet() -> Fernet:
    key = get_settings().encryption_key
    if not key:
        raise ValueError("ENCRYPTION_KEY not set in environment")
    return Fernet(key.encode())


def encrypt_value(plaintext: str) -> str:
    """Encrypt a credential value. Returns base64 string."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a credential value. Returns plaintext."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()


def generate_key() -> str:
    """Generate a new Fernet key. Call once to create ENCRYPTION_KEY."""
    return Fernet.generate_key().decode()


def encrypt_with_new_key(ciphertext: str, new_key: str) -> str:
    """Re-encrypt a value with a new key (for key rotation)."""
    old_plaintext = decrypt_value(ciphertext)
    f = Fernet(new_key.encode())
    return f.encrypt(old_plaintext.encode()).decode()