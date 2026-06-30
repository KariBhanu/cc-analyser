"""Statements: upload+parse a PDF (draft), or save confirmed/manual figures."""
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..deps import get_current_user, store
from ..models import StatementIn
from ..security import decrypt
from ..services import rewards
from ..services.statements import parse_statement

router = APIRouter(prefix="/api/statements", tags=["statements"])

COLLECTION = "statements"


@router.post("/upload")
async def upload_statement(
    card_id: str = Form(...),
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    user: str = Depends(get_current_user),
):
    """Parse a PDF and return a DRAFT for the user to confirm. Does not save."""
    card = store.get("cards", card_id, user)
    if not card:
        raise HTTPException(404, "Card not found")

    pw = password
    if not pw and card.get("statement_password_enc"):
        pw = decrypt(card["statement_password_enc"])

    data = await file.read()
    result = parse_statement(data, pw)
    result["card_id"] = card_id
    result["filename"] = file.filename
    return result


@router.get("")
async def list_statements(user: str = Depends(get_current_user)):
    return store.list(COLLECTION, user)


@router.post("", status_code=201)
async def create_statement(body: StatementIn, user: str = Depends(get_current_user)):
    """Save a confirmed/manual statement; computes points + rupee reward value."""
    card = store.get("cards", body.card_id, user)
    if not card:
        raise HTTPException(404, "Card not found")

    points = body.points_earned
    if points is None:
        points = rewards.points_for_spend(card, body.total_spend)

    record = {
        "id": uuid4().hex,
        "user": user,
        "card_id": body.card_id,
        "period_start": body.period_start,
        "period_end": body.period_end,
        "total_spend": body.total_spend,
        "points_earned": points,
        "reward_value": rewards.reward_value(card, points),
        "note": body.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    store.add(COLLECTION, record)
    return record


@router.delete("/{statement_id}", status_code=204)
async def delete_statement(statement_id: str, user: str = Depends(get_current_user)):
    if not store.delete(COLLECTION, statement_id, user):
        raise HTTPException(404, "Statement not found")
