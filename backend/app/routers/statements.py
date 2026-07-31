"""Statements: upload+parse a PDF (draft), or save confirmed/manual figures."""
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..deps import get_current_user, store
from ..models import StatementIn
from ..security import decrypt
from ..services import rewards
from ..services.statements import merchant_of, parse_statement

router = APIRouter(prefix="/api/statements", tags=["statements"])

COLLECTION = "statements"
TXN_COLLECTION = "transactions"


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


def _find_duplicate(user: str, body: StatementIn) -> Optional[dict]:
    """An existing statement that looks like the same one, or None.

    Same card and same billing period is the strong signal -- a card has one
    statement per cycle. Where the period is unknown (manual entry, or a PDF we
    couldn't read a period out of) fall back to matching the total, which at
    least catches uploading the identical file twice.
    """
    for existing in store.list(COLLECTION, user):
        if existing.get("card_id") != body.card_id:
            continue
        if body.period_end and existing.get("period_end") == body.period_end:
            return existing
        if not body.period_end and not existing.get("period_end"):
            if existing.get("total_spend") == body.total_spend:
                return existing
    return None


def _replace_transactions(user: str, statement_id: str, card_id: str, transactions: list) -> None:
    """Point `statement_id` at exactly `transactions`, dropping any it had."""
    for existing in store.list(TXN_COLLECTION, user):
        if existing.get("statement_id") == statement_id:
            store.delete(TXN_COLLECTION, existing["id"], user)
    for txn in transactions:
        store.add(TXN_COLLECTION, {
            "id": uuid4().hex,
            "user": user,
            "statement_id": statement_id,
            "card_id": card_id,
            **txn,
        })


def _clean_transactions(body: StatementIn) -> list:
    """Merchant labels filled in server-side, so grouping stays consistent even
    for rows typed in by hand."""
    out = []
    for txn in body.transactions:
        item = txn.model_dump()
        item["merchant"] = item.get("merchant") or merchant_of(item.get("description", ""))
        out.append(item)
    return out


@router.post("", status_code=201)
async def create_statement(
    body: StatementIn,
    replace: bool = False,
    user: str = Depends(get_current_user),
):
    """Save a confirmed/manual statement; computes points + rupee reward value.

    Re-uploading the same statement returns 409 rather than silently adding a
    second copy, which would double-count spend on the dashboard. Pass
    ?replace=true to overwrite the existing one and its transactions.
    """
    card = store.get("cards", body.card_id, user)
    if not card:
        raise HTTPException(404, "Card not found")

    duplicate = _find_duplicate(user, body)
    if duplicate and not replace:
        period = duplicate.get("period_end") or "an unknown period"
        raise HTTPException(409, detail={
            "message": (
                f"A statement for {card.get('issuer', '')} {card.get('name', '')} "
                f"ending {period} is already saved. Replace it?"
            ),
            "existing_id": duplicate["id"],
            "existing_total": duplicate.get("total_spend"),
            "existing_period_end": duplicate.get("period_end"),
            "duplicate": True,
        })

    points = body.points_earned
    if points is None:
        points = rewards.points_for_spend(card, body.total_spend)

    transactions = _clean_transactions(body)
    fields = {
        "card_id": body.card_id,
        "period_start": body.period_start,
        "period_end": body.period_end,
        "total_spend": body.total_spend,
        "points_earned": points,
        "reward_value": rewards.reward_value(card, points),
        "note": body.note,
        "transaction_count": len(transactions),
    }

    if duplicate:
        record = store.update(COLLECTION, duplicate["id"], {
            **fields, "updated_at": datetime.now(timezone.utc).isoformat(),
        }, user)
        _replace_transactions(user, duplicate["id"], body.card_id, transactions)
        return record

    record = {
        "id": uuid4().hex,
        "user": user,
        **fields,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    store.add(COLLECTION, record)
    _replace_transactions(user, record["id"], body.card_id, transactions)
    return record


@router.get("/transactions")
async def list_transactions(user: str = Depends(get_current_user)):
    """Every transaction across every statement, newest first.

    Card issuer/name travel with each row so the Statements page can filter
    without a second request.
    """
    cards = {c["id"]: c for c in store.list("cards", user)}
    rows = []
    for txn in store.list(TXN_COLLECTION, user):
        card = cards.get(txn.get("card_id"), {})
        label = f"{card.get('issuer', '')} {card.get('name', '')}".strip()
        rows.append({**txn, "card_label": label or "Unknown card"})
    # Undated rows sort last rather than blowing up the comparison.
    rows.sort(key=lambda r: r.get("date") or "", reverse=True)
    return rows


@router.delete("/{statement_id}", status_code=204)
async def delete_statement(statement_id: str, user: str = Depends(get_current_user)):
    if not store.delete(COLLECTION, statement_id, user):
        raise HTTPException(404, "Statement not found")
    # Otherwise the rows linger and keep showing up on the Statements page.
    _replace_transactions(user, statement_id, "", [])
