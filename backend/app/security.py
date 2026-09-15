"""Symmetric encryption for sensitive fields (e.g. statement PDF passwords).

Key is derived from APP_SECRET so we don't manage a second secret. Rotating
APP_SECRET invalidates previously stored passwords (user re-enters them).
"""
import base64
import hashlib

from cryptography.fernet import Fernet

from .config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.app_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
