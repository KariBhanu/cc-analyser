"""User accounts: lookup, creation, and the public shape returned to the client.

Records live in the `users` collection. They are NOT owned by a user, so every
store call here passes user=None and filters in Python.

The rest of the app scopes data by the owner's EMAIL (see deps.get_current_user),
so `email` is the identity key and is stored normalised and unique.
"""
import re
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from . import passwords

COLLECTION = "users"

# Indian mobile numbers: 10 digits starting 6-9, optionally already +91 prefixed.
_DIGITS = re.compile(r"\D+")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")


def normalise_email(email: str) -> str:
    return (email or "").strip().lower()


def valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(normalise_email(email)))


def normalise_phone(phone: str) -> Optional[str]:
    """Return E.164 (+91XXXXXXXXXX) or None if it isn't a usable Indian mobile.

    Accepts "98765 43210", "+91-9876543210", "09876543210", "919876543210".
    """
    digits = _DIGITS.sub("", phone or "")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) != 10 or digits[0] not in "6789":
        return None
    return f"+91{digits}"


def find_by_email(store, email: str) -> Optional[dict]:
    target = normalise_email(email)
    return next((r for r in store.list(COLLECTION) if r.get("email") == target), None)


def find_by_phone(store, phone: str) -> Optional[dict]:
    return next((r for r in store.list(COLLECTION) if r.get("phone") == phone), None)


def find_by_id(store, user_id: str) -> Optional[dict]:
    return store.get(COLLECTION, user_id)


def create(store, *, name: str, email: str, phone: Optional[str],
           password: Optional[str], provider: str = "password",
           email_verified: bool = False) -> dict:
    record = {
        "id": uuid4().hex,
        "name": (name or "").strip(),
        "email": normalise_email(email),
        "phone": phone,
        "password_hash": passwords.hash_password(password) if password else None,
        "provider": provider,                 # "password" or "google"
        "email_verified": email_verified,
        "phone_verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    store.add(COLLECTION, record)
    return record


def update_flags(store, user_id: str, patch: dict) -> Optional[dict]:
    """Patch non-secret fields (verification flags, picture, name).

    Rejects direct writes to credential fields so a caller can't accidentally
    smuggle a plaintext password or overwrite the hash through this path.
    """
    forbidden = {"password_hash", "password", "id", "email"}
    overlap = forbidden & patch.keys()
    if overlap:
        raise ValueError(f"update_flags cannot set: {', '.join(sorted(overlap))}")
    return store.update(COLLECTION, user_id, patch)


def set_password(store, user_id: str, password: str) -> Optional[dict]:
    return store.update(COLLECTION, user_id, {
        "password_hash": passwords.hash_password(password),
    })


def public(record: dict) -> dict:
    """The session/`/me` shape. Never includes the password hash."""
    return {
        "email": record.get("email"),
        "name": record.get("name"),
        "phone": record.get("phone"),
        "picture": record.get("picture"),
        "provider": record.get("provider"),
        "email_verified": bool(record.get("email_verified")),
        "phone_verified": bool(record.get("phone_verified")),
    }
