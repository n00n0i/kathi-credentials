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
    """Decrypt a credential value. Returns plaintext.

    For SSH_KEY credentials in PEM format: if the decrypted value lacks newlines
    but starts with a PEM header (-----BEGIN), reformat with proper 64-char
    line breaks so the key is valid for SSH/libcrypto use.
    """
    f = _get_fernet()
    plaintext = f.decrypt(ciphertext.encode()).decode()

    # Reconstruct PEM newlines if stripped during storage.
    # Fernet ciphertext is deterministic per-call, so storing without newlines
    # removes structural formatting. Detect PEM headers to fix.
    if plaintext.startswith("-----BEGIN") and "\n" not in plaintext:
        # PEM body is base64; split into 64-char lines
        header_end = plaintext.index("\n") + 1
        header = plaintext[:header_end]
        body = plaintext[header_end:].replace(" ", "")
        lines = [body[i:i + 64] for i in range(0, len(body), 64)]
        plaintext = header + "\n".join(lines) + "\n"

    return plaintext


def generate_key() -> str:
    """Generate a new Fernet key. Call once to create ENCRYPTION_KEY."""
    return Fernet.generate_key().decode()


def encrypt_with_new_key(ciphertext: str, new_key: str) -> str:
    """Re-encrypt a value with a new key (for key rotation)."""
    old_plaintext = decrypt_value(ciphertext)
    f = Fernet(new_key.encode())
    return f.encrypt(old_plaintext.encode()).decode()