"""Password hashing.

Uses `hashlib.scrypt` from the standard library rather than argon2/bcrypt: this
venv is uv-managed with no pip, and scrypt is a memory-hard KDF that is entirely
adequate here. Parameters follow the interactive-login profile (N=2^14, r=8, p=1)
-- roughly 16 MB and ~50-100 ms per hash, which is the point.

Stored format is self-describing so parameters can be raised later without
invalidating existing hashes:

    scrypt$16384$8$1$<base64 salt>$<base64 derived key>
"""
import base64
import hashlib
import hmac
import secrets

_SCHEME = "scrypt"
_N = 2 ** 14
_R = 8
_P = 1
_DKLEN = 32
_SALT_BYTES = 16

MIN_LENGTH = 8


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return "$".join([
        _SCHEME, str(_N), str(_R), str(_P),
        base64.b64encode(salt).decode(),
        base64.b64encode(dk).decode(),
    ])


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of `password` against a stored hash.

    Returns False (never raises) on any malformed stored value, so a corrupt or
    legacy record fails closed rather than 500-ing the login endpoint.
    """
    if not stored:
        return False
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != _SCHEME:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.scrypt(
            password.encode("utf-8"), salt=salt,
            n=int(n), r=int(r), p=int(p), dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk, expected)
