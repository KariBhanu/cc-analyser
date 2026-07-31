"""Shared dependencies: the storage singleton and the auth guard."""
import logging

from fastapi import HTTPException, Request

from .config import settings
from .storage.json_store import JsonStore

# "uvicorn.error" is the logger uvicorn actually configures and prints, so this
# shows up in the normal startup output rather than being swallowed.
_log = logging.getLogger("uvicorn.error")


def _safe_host(dsn: str) -> str:
    """Host portion of a DSN, with any user:password stripped."""
    tail = dsn.rsplit("@", 1)[-1]
    return tail.split("/")[0] or "unknown"


# Postgres when DATABASE_URL is set, JSON files otherwise. Both implement
# StorageInterface, so nothing downstream knows the difference.
if settings.database_url:
    from .storage.postgres_store import PostgresStore

    store = PostgresStore(settings.database_url)
    _log.info("storage: postgres (%s)", _safe_host(settings.database_url))
else:
    store = JsonStore(settings.data_dir)
    _log.info("storage: json files (%s)", settings.data_dir)


def get_current_user(request: Request) -> str:
    """Return the logged-in user's email, or 401. Used as a FastAPI dependency."""
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user["email"]
