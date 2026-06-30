"""Shared dependencies: the storage singleton and the auth guard."""
from fastapi import HTTPException, Request

from .config import settings
from .storage.json_store import JsonStore

store = JsonStore(settings.data_dir)


def get_current_user(request: Request) -> str:
    """Return the logged-in user's email, or 401. Used as a FastAPI dependency."""
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user["email"]
