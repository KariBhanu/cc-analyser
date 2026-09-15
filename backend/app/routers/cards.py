"""A user's own cards. Reward terms come from the bundled catalog; the user
picks which card they hold and supplies only the statement password."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_user, store
from ..models import CardIn, CardUpdate
from ..security import encrypt
from ..services import catalog

router = APIRouter(prefix="/api/cards", tags=["cards"])

COLLECTION = "cards"


def _public(card: dict) -> dict:
    """Strip the encrypted password; expose only whether one is set."""
    out = {k: v for k, v in card.items() if k != "statement_password_enc"}
    out["has_password"] = bool(card.get("statement_password_enc"))
    return out


@router.get("")
async def list_cards(user: str = Depends(get_current_user)):
    return [_public(c) for c in store.list(COLLECTION, user)]


@router.post("", status_code=201)
async def create_card(body: CardIn, user: str = Depends(get_current_user)):
    record = body.model_dump(exclude={"statement_password"})
    if body.catalog_slug:
        # Resolve server-side: the client sends only which card this is, so it
        # can't submit terms that disagree with the catalog.
        terms = catalog.terms_for(body.catalog_slug)
        if terms is None:
            raise HTTPException(400, f"Unknown catalog card {body.catalog_slug!r}")
        record.update(terms)
    record["id"] = uuid4().hex
    record["user"] = user
    if body.statement_password:
        record["statement_password_enc"] = encrypt(body.statement_password)
    store.add(COLLECTION, record)
    return _public(record)


@router.put("/{card_id}")
async def update_card(card_id: str, body: CardUpdate, user: str = Depends(get_current_user)):
    patch = body.model_dump(exclude_unset=True)
    if "statement_password" in patch:
        pw = patch.pop("statement_password")
        patch["statement_password_enc"] = encrypt(pw) if pw else None
    updated = store.update(COLLECTION, card_id, patch, user)
    if not updated:
        raise HTTPException(404, "Card not found")
    return _public(updated)


@router.delete("/{card_id}", status_code=204)
async def delete_card(card_id: str, user: str = Depends(get_current_user)):
    if not store.delete(COLLECTION, card_id, user):
        raise HTTPException(404, "Card not found")
