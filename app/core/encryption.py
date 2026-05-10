import base64
from cryptography.fernet import Fernet
from app.core.config import get_settings


def _get_fernet() -> Fernet:
    settings = get_settings()
    raw_key = settings.credential_encryption_key.encode()
    padded = base64.urlsafe_b64encode(raw_key[:32].ljust(32, b"0"))
    return Fernet(padded)


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
