"""Assistant screen: analyse a free-text query against the user's own data."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_user, store
from ..models import AssistantQuery
from ..services import assistant

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/query")
async def query(body: AssistantQuery, user: str = Depends(get_current_user)):
    text = body.query.strip()
    if not text:
        raise HTTPException(422, "Query is empty")
    cards = store.list("cards", user)
    statements = store.list("statements", user)
    return assistant.answer(text, cards, statements)
