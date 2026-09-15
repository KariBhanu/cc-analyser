"""Read-only catalog lookup, so the Add Card form can be two dropdowns."""
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_user
from ..services import catalog

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/issuers")
def list_issuers(_: str = Depends(get_current_user)):
    return catalog.issuers()


@router.get("/cards")
def list_cards(issuer: str, _: str = Depends(get_current_user)):
    cards = catalog.cards_for(issuer)
    if not cards:
        raise HTTPException(404, f"Unknown issuer {issuer!r}")
    return cards
