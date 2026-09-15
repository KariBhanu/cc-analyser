"""Curated India credit-card catalog.

backend/catalog/<issuer>.json holds 417 cards across 17 issuers, each with the
terms the rewards engine needs. Until now nothing read them and users typed
every term by hand, which is both tedious and the main source of wrong reward
maths -- people rarely know their card's rupee-per-point.

Loaded once at import (712 KB, ~13k lines) and held in memory. It is static
data shipped with the app, so there is nothing to invalidate.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

_CATALOG_DIR = Path(__file__).resolve().parents[2] / "catalog"

# Terms copied onto a user's card when they pick from the catalog. Left-hand
# side is the catalog's field name, right-hand side the app's.
TERM_FIELDS = {
    "annual_fee": "annual_fee",
    "fee_waiver_spend": "waiver_threshold",
    "base_points_per_100": "base_points_per_100",
    "rupee_per_point": "rupee_per_point",
    "merchant_bonuses": "merchant_bonuses",
    "base_monthly_cap": "base_monthly_cap",
    "bonus_monthly_cap": "bonus_monthly_cap",
}


@lru_cache(maxsize=1)
def _load() -> list[dict]:
    """[{slug, bank, cards: [...]}, ...] sorted by bank name."""
    issuers = []
    for path in sorted(_CATALOG_DIR.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue  # a malformed issuer file shouldn't take the app down
        cards = raw.get("cards") or []
        if not cards:
            continue
        issuers.append({
            "slug": raw.get("bank_slug") or path.stem,
            "bank": raw.get("bank") or path.stem.upper(),
            "last_verified": raw.get("last_verified"),
            "cards": cards,
        })
    return sorted(issuers, key=lambda i: i["bank"].lower())


def issuers() -> list[dict]:
    """Issuers with a card count -- enough to populate the first dropdown."""
    return [
        {"slug": i["slug"], "bank": i["bank"], "card_count": len(i["cards"])}
        for i in _load()
    ]


def cards_for(issuer_slug: str) -> list[dict]:
    """Cards for one issuer, trimmed to what the picker needs to show."""
    for issuer in _load():
        if issuer["slug"] == issuer_slug:
            return [
                {
                    "slug": c["slug"],
                    "name": c["name"],
                    "variant": c.get("variant"),
                    "category": c.get("category"),
                    "status": c.get("status"),
                    "network": c.get("network") or [],
                    "reward_currency": c.get("reward_currency"),
                    **{app_key: c.get(cat_key) for cat_key, app_key in TERM_FIELDS.items()},
                }
                for c in issuer["cards"]
            ]
    return []


def find(card_slug: str) -> Optional[dict]:
    """The full catalog entry for a card slug, or None. Slugs are unique."""
    for issuer in _load():
        for card in issuer["cards"]:
            if card.get("slug") == card_slug:
                return {**card, "issuer_slug": issuer["slug"], "issuer": issuer["bank"]}
    return None


def terms_for(card_slug: str) -> Optional[dict]:
    """Just the reward terms, keyed the way the app's card record expects.

    Returns None when the slug is unknown, so the caller can 400 rather than
    silently creating a card with zeroed-out terms (which would quietly produce
    wrong reward totals forever).
    """
    card = find(card_slug)
    if card is None:
        return None
    terms = {}
    for cat_key, app_key in TERM_FIELDS.items():
        value = card.get(cat_key)
        if app_key == "merchant_bonuses":
            value = value or []
        elif app_key in ("annual_fee", "waiver_threshold", "base_points_per_100"):
            value = value or 0
        elif app_key == "rupee_per_point":
            value = value if value is not None else 1.0
        terms[app_key] = value
    return terms
