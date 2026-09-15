"""One-time codes for verifying an email address or a phone number.

Design notes:
  * Codes are stored HMAC'd (keyed on APP_SECRET), never in plaintext -- a leaked
    data/otps.json must not let anyone complete a verification.
  * Each code has a TTL, a per-code attempt ceiling, and a resend throttle, so
    brute-forcing 6 digits or spamming sends both fail.
  * Issuing a new code consumes any earlier outstanding one for the same
    (user, channel), so only the newest code is ever valid.
"""
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Optional
from uuid import uuid4

from ..config import settings

COLLECTION = "otps"

EMAIL = "email"
PHONE = "phone"
CHANNELS = (EMAIL, PHONE)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        parsed = datetime.fromisoformat(str(ts))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _digest(user_id: str, channel: str, code: str) -> str:
    """HMAC the code so the stored value can't be replayed straight from disk."""
    msg = f"{user_id}:{channel}:{code}".encode()
    return hmac.new(settings.app_secret.encode(), msg, sha256).hexdigest()


def _new_code() -> str:
    upper = 10 ** settings.otp_length
    return str(secrets.randbelow(upper)).zfill(settings.otp_length)


def _outstanding(store, user_id: str, channel: str) -> list[dict]:
    return [
        r for r in store.list(COLLECTION)
        if r.get("user_id") == user_id and r.get("channel") == channel and not r.get("consumed")
    ]


def seconds_until_resend(store, user_id: str, channel: str) -> int:
    """0 if a new code can be sent now, else how long the caller must wait."""
    issued = [
        _parse(r.get("created_at"))
        for r in store.list(COLLECTION)
        if r.get("user_id") == user_id and r.get("channel") == channel
    ]
    issued = [t for t in issued if t is not None]
    if not issued:
        return 0
    elapsed = (_now() - max(issued)).total_seconds()
    return max(0, int(settings.otp_resend_seconds - elapsed))


def issue(store, user_id: str, channel: str, destination: str) -> str:
    """Create a code for (user, channel) and return the PLAINTEXT for sending.

    The plaintext exists only in this return value -- the caller hands it to the
    mailer/SMS sender and drops it. Callers must check `seconds_until_resend`
    first if they want throttling (the endpoints do).
    """
    if channel not in CHANNELS:
        raise ValueError(f"Unknown channel: {channel}")

    for old in _outstanding(store, user_id, channel):
        store.update(COLLECTION, old["id"], {"consumed": True, "superseded": True})

    code = _new_code()
    store.add(COLLECTION, {
        "id": uuid4().hex,
        "user_id": user_id,
        "channel": channel,
        "destination": destination,
        "code_hash": _digest(user_id, channel, code),
        "created_at": _now().isoformat(),
        "expires_at": (_now() + timedelta(seconds=settings.otp_ttl_seconds)).isoformat(),
        "attempts": 0,
        "consumed": False,
    })
    return code


def verify(store, user_id: str, channel: str, code: str) -> tuple[bool, Optional[str]]:
    """Check a submitted code. Returns (ok, error_message)."""
    candidates = _outstanding(store, user_id, channel)
    if not candidates:
        return False, "No code outstanding. Request a new one."

    record = max(candidates, key=lambda r: str(r.get("created_at") or ""))

    expires = _parse(record.get("expires_at"))
    if expires is None or _now() > expires:
        store.update(COLLECTION, record["id"], {"consumed": True, "expired": True})
        return False, "That code has expired. Request a new one."

    attempts = int(record.get("attempts", 0))
    if attempts >= settings.otp_max_attempts:
        store.update(COLLECTION, record["id"], {"consumed": True, "locked": True})
        return False, "Too many incorrect attempts. Request a new code."

    submitted = (code or "").strip()
    if not hmac.compare_digest(record.get("code_hash", ""), _digest(user_id, channel, submitted)):
        remaining = settings.otp_max_attempts - (attempts + 1)
        store.update(COLLECTION, record["id"], {"attempts": attempts + 1})
        if remaining <= 0:
            store.update(COLLECTION, record["id"], {"consumed": True, "locked": True})
            return False, "Too many incorrect attempts. Request a new code."
        plural = "try" if remaining == 1 else "tries"
        return False, f"Incorrect code. {remaining} {plural} left."

    store.update(COLLECTION, record["id"], {"consumed": True, "verified_at": _now().isoformat()})
    return True, None
