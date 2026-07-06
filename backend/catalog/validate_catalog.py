"""Validate catalog JSON files against the schema in README.md.

Usage: python3 validate_catalog.py [file.json ...]   (no args = all *.json here)
Exits non-zero if any file has errors. Warnings don't fail the build.
"""
import json
import sys
from pathlib import Path

CATALOG_DIR = Path(__file__).parent

TOP_KEYS = {"bank": str, "bank_slug": str, "tier": int, "last_verified": str, "cards": list}

# field -> (types allowed, required)
CARD_FIELDS = {
    "name": ((str,), True),
    "slug": ((str,), True),
    "network": ((list, type(None)), False),
    "variant": ((str, type(None)), False),
    "category": ((str,), True),
    "status": ((str,), True),
    "joining_fee": ((int, float, type(None)), False),
    "annual_fee": ((int, float, type(None)), True),
    "fee_waiver_spend": ((int, float, type(None)), True),
    "base_points_per_100": ((int, float, type(None)), True),
    "rupee_per_point": ((int, float, type(None)), True),
    "merchant_bonuses": ((list,), True),
    "base_monthly_cap": ((int, float, type(None)), False),
    "bonus_monthly_cap": ((int, float, type(None)), False),
    "reward_currency": ((str, type(None)), False),
    "welcome_benefit": ((str, type(None)), False),
    "milestone_benefits": ((str, type(None)), False),
    "lounge_access": ((str, type(None)), False),
    "fuel_surcharge_waiver": ((str, type(None)), False),
    "forex_markup_pct": ((int, float, type(None)), False),
    "reward_exclusions": ((str, type(None)), False),
    "eligibility": ((str, type(None)), False),
    "notes": ((str, type(None)), False),
    "source_urls": ((list,), True),
    "last_verified": ((str,), False),
}

VALID_STATUS = {"active", "discontinued"}
VALID_CATEGORY = {
    "cashback", "rewards", "travel", "premium", "super-premium",
    "co-branded", "fuel", "entry-level", "business",
}


def validate_file(path: Path) -> tuple[list[str], list[str], int]:
    errors, warnings = [], []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        return [f"invalid JSON: {e}"], [], 0

    for key, typ in TOP_KEYS.items():
        if key not in data:
            errors.append(f"missing top-level key '{key}'")
        elif not isinstance(data[key], typ):
            errors.append(f"top-level '{key}' should be {typ.__name__}")
    if data.get("bank_slug") and data["bank_slug"] != path.stem:
        errors.append(f"bank_slug '{data['bank_slug']}' != filename '{path.stem}'")

    slugs = set()
    for i, card in enumerate(data.get("cards", [])):
        label = f"cards[{i}] ({card.get('name', '?')})"
        for field, (types, required) in CARD_FIELDS.items():
            if field not in card:
                if required:
                    errors.append(f"{label}: missing required field '{field}'")
                continue
            if not isinstance(card[field], types):
                errors.append(f"{label}: '{field}' has wrong type {type(card[field]).__name__}")
        for field in card:
            if field not in CARD_FIELDS:
                warnings.append(f"{label}: unknown field '{field}'")
        if card.get("status") not in VALID_STATUS:
            warnings.append(f"{label}: status '{card.get('status')}' not in {sorted(VALID_STATUS)}")
        if card.get("category") not in VALID_CATEGORY:
            warnings.append(f"{label}: category '{card.get('category')}' not in {sorted(VALID_CATEGORY)}")
        for j, mb in enumerate(card.get("merchant_bonuses", [])):
            if not isinstance(mb, dict) or "merchant" not in mb or "points_per_100" not in mb:
                errors.append(f"{label}: merchant_bonuses[{j}] needs 'merchant' and 'points_per_100'")
        slug = card.get("slug")
        if slug in slugs:
            errors.append(f"{label}: duplicate slug '{slug}'")
        slugs.add(slug)
        if not card.get("source_urls"):
            warnings.append(f"{label}: no source_urls")

    return errors, warnings, len(data.get("cards", []))


def main() -> int:
    files = [Path(a) for a in sys.argv[1:]] or sorted(CATALOG_DIR.glob("*.json"))
    total_cards, failed = 0, False
    for path in files:
        errors, warnings, n = validate_file(path)
        total_cards += n
        status = "FAIL" if errors else "ok"
        print(f"{status:4}  {path.name:28} {n:3} cards, {len(errors)} errors, {len(warnings)} warnings")
        for e in errors:
            print(f"      ERROR   {e}")
        for w in warnings:
            print(f"      warn    {w}")
        failed |= bool(errors)
    print(f"\ntotal: {len(files)} files, {total_cards} cards")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
