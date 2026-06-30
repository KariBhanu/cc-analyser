"""Rewards & fee-waiver calculations. Pure functions over plain card/statement dicts."""
from datetime import date, datetime
from typing import Optional


def reward_rate_for_merchant(card: dict, merchant: Optional[str]) -> float:
    """Points per Rs.100 for a merchant, falling back to the card's base rate."""
    if merchant:
        for b in card.get("merchant_bonuses", []):
            if b.get("merchant", "").strip().lower() == merchant.strip().lower():
                return float(b.get("points_per_100", 0))
    return float(card.get("base_points_per_100", 0))


def points_for_spend(card: dict, spend: float, merchant: Optional[str] = None) -> float:
    return spend / 100.0 * reward_rate_for_merchant(card, merchant)


def reward_value(card: dict, points: float) -> float:
    """Rupee value of points using the card's single conversion rate."""
    return points * float(card.get("rupee_per_point", 1.0))


def value_per_100(card: dict, merchant: Optional[str] = None) -> float:
    """Effective rupee reward per Rs.100 spent -- the apples-to-apples comparison metric."""
    return reward_rate_for_merchant(card, merchant) * float(card.get("rupee_per_point", 1.0))


def current_fy_bounds(today: Optional[date] = None) -> tuple[date, date]:
    """Indian financial year: 1 Apr -> 31 Mar."""
    today = today or date.today()
    if today.month >= 4:
        return date(today.year, 4, 1), date(today.year + 1, 3, 31)
    return date(today.year - 1, 4, 1), date(today.year, 3, 31)


def _stmt_date(stmt: dict) -> Optional[date]:
    raw = stmt.get("period_end") or stmt.get("created_at")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw)).date()
    except ValueError:
        try:
            return date.fromisoformat(str(raw)[:10])
        except ValueError:
            return None


def spend_in_current_fy(statements: list[dict]) -> float:
    start, end = current_fy_bounds()
    total = 0.0
    for s in statements:
        d = _stmt_date(s)
        if d is not None and start <= d <= end:
            total += float(s.get("total_spend", 0))
    return total


def fee_waiver_status(card: dict, fy_spend: float) -> dict:
    threshold = float(card.get("waiver_threshold", 0) or 0)
    if threshold <= 0:
        return {"applicable": False, "threshold": 0, "fy_spend": fy_spend,
                "remaining": 0, "pct": None, "waived": True}
    remaining = max(0.0, threshold - fy_spend)
    return {
        "applicable": True,
        "threshold": threshold,
        "fy_spend": fy_spend,
        "remaining": remaining,
        "pct": min(1.0, fy_spend / threshold),
        "waived": remaining == 0,
        "annual_fee": float(card.get("annual_fee", 0) or 0),
    }
