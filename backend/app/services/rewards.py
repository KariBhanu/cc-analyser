"""Rewards & fee-waiver calculations. Pure functions over plain card/statement dicts."""
from datetime import date, datetime, timedelta
from typing import Optional


def is_bonus_merchant(card: dict, merchant: Optional[str]) -> bool:
    """True if the merchant matches one of the card's accelerated (bonus) merchants."""
    if not merchant:
        return False
    return any(
        b.get("merchant", "").strip().lower() == merchant.strip().lower()
        for b in card.get("merchant_bonuses", [])
    )


def reward_rate_for_merchant(card: dict, merchant: Optional[str]) -> float:
    """Points per Rs.100 for a merchant, falling back to the card's base rate."""
    if merchant:
        for b in card.get("merchant_bonuses", []):
            if b.get("merchant", "").strip().lower() == merchant.strip().lower():
                return float(b.get("points_per_100", 0))
    return float(card.get("base_points_per_100", 0))


def capped_reward_for_spend(card: dict, amount: float, merchant: Optional[str] = None) -> dict:
    """Reward for a single spend, applying the relevant monthly cap.

    The cap is the BONUS cap for accelerated merchants, else the BASE cap. We treat
    it as a ceiling on this spend assuming a fresh month (no other spend yet) -- a
    deliberate v1 simplification for the "best card" what-if comparison.
    """
    rate = reward_rate_for_merchant(card, merchant)
    points = amount / 100.0 * rate
    cap = card.get("bonus_monthly_cap") if is_bonus_merchant(card, merchant) else card.get("base_monthly_cap")
    cap = float(cap) if cap else None
    capped = bool(cap is not None and points > cap)
    if capped:
        points = cap
    return {"rate": rate, "points": points, "capped": capped, "cap_points": cap}


def points_for_spend(card: dict, spend: float, merchant: Optional[str] = None) -> float:
    return spend / 100.0 * reward_rate_for_merchant(card, merchant)


def reward_value(card: dict, points: float) -> float:
    """Rupee value of points using the card's single conversion rate."""
    return points * float(card.get("rupee_per_point", 1.0))


def value_per_100(card: dict, merchant: Optional[str] = None) -> float:
    """Effective rupee reward per Rs.100 spent -- the apples-to-apples comparison metric."""
    return reward_rate_for_merchant(card, merchant) * float(card.get("rupee_per_point", 1.0))


def current_fy_bounds(today: Optional[date] = None) -> tuple[date, date]:
    """Indian financial year: 1 Apr -> 31 Mar.

    Only a fallback for cards with no opening date. Banks assess the annual fee
    on the CARD year, not the financial year -- see card_year_bounds.
    """
    today = today or date.today()
    if today.month >= 4:
        return date(today.year, 4, 1), date(today.year + 1, 3, 31)
    return date(today.year - 1, 4, 1), date(today.year, 3, 31)


def _anniversary(opened: date, year: int) -> date:
    """`opened`'s day/month in `year`, clamped for 29 Feb in a non-leap year."""
    try:
        return opened.replace(year=year)
    except ValueError:
        return date(year, 2, 28)


def parse_opened_on(raw) -> Optional[tuple]:
    """(date, precision) from an `opened_on` value, or None if unusable.

    Accepts "2024-03" as well as "2024-03-22". Nobody remembers the exact day a
    card was opened, but the month is findable from the welcome email, so the
    UI asks for month + year and we assume the 1st. That leaves the window up
    to ~30 days out, against up to a year out for the financial-year fallback.
    """
    if not raw:
        return None
    text = str(raw).strip()
    try:
        if len(text) == 7:  # YYYY-MM
            year, month = int(text[:4]), int(text[5:7])
            return date(year, month, 1), "month"
        return date.fromisoformat(text[:10]), "day"
    except (ValueError, IndexError):
        return None


def card_year_bounds(card: dict, today: Optional[date] = None):
    """(start, end, year_number, precision) for the current membership year.

    A card opened in Mar 2024 renews each March, so its fee is assessed on
    spend between anniversaries -- NOT over 1 Apr - 31 Mar. Using the financial
    year silently misreports how far off a waiver is, by up to a full year's
    spend either way.

    Returns None when the card has no opening date, so the caller can fall back
    and say which basis it used.
    """
    parsed = parse_opened_on(card.get("opened_on"))
    if parsed is None:
        return None
    opened, precision = parsed

    today = today or date.today()
    if today < opened:
        # Future-dated card: it is still in its first year.
        end = _anniversary(opened, opened.year + 1) - timedelta(days=1)
        return opened, end, 1, precision

    start_year = today.year if today >= _anniversary(opened, today.year) else today.year - 1
    start = _anniversary(opened, start_year)
    end = _anniversary(opened, start_year + 1) - timedelta(days=1)
    return start, end, start_year - opened.year + 1, precision


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


def _spend_between(statements: list[dict], start: date, end: date) -> float:
    total = 0.0
    for s in statements:
        d = _stmt_date(s)
        if d is not None and start <= d <= end:
            total += float(s.get("total_spend", 0))
    return total


def spend_in_current_fy(statements: list[dict]) -> float:
    """Spend in the current financial year. Retained for callers with no card."""
    start, end = current_fy_bounds()
    return _spend_between(statements, start, end)


def waiver_window(card: dict, statements: list[dict], today: Optional[date] = None) -> dict:
    """Spend counting toward this card's fee waiver, and the window it covers.

    Uses the card's own membership year when we know when it was opened, and
    falls back to the financial year otherwise -- reporting which, so the UI can
    tell the user the number is approximate until they supply the date.
    """
    bounds = card_year_bounds(card, today)
    if bounds:
        start, end, year_number, precision = bounds
        basis = "card_year"
    else:
        start, end = current_fy_bounds(today)
        year_number, precision = None, None
        basis = "financial_year"
    return {
        "spend": _spend_between(statements, start, end),
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "basis": basis,
        "year_number": year_number,
        # "month" means the day was assumed, so the window edges are ~30 days
        # approximate; the UI says so rather than implying false precision.
        "precision": precision,
    }


def fee_waiver_status(card: dict, window) -> dict:
    """Fee-waiver progress. `window` is a waiver_window() dict, or a bare float
    for older callers that only had a financial-year total."""
    if isinstance(window, dict):
        spend = window.get("spend", 0.0)
        extra = {k: window.get(k)
                 for k in ("period_start", "period_end", "basis", "year_number", "precision")}
    else:
        spend = float(window or 0)
        extra = {"period_start": None, "period_end": None,
                 "basis": "financial_year", "year_number": None, "precision": None}

    threshold = float(card.get("waiver_threshold", 0) or 0)
    if threshold <= 0:
        # `fy_spend` is kept alongside `spend` because the dashboard and cards
        # pages still read it.
        return {"applicable": False, "threshold": 0, "spend": spend, "fy_spend": spend,
                "remaining": 0, "pct": None, "waived": True, **extra}
    remaining = max(0.0, threshold - spend)
    return {
        "applicable": True,
        "threshold": threshold,
        "spend": spend,
        "fy_spend": spend,
        "remaining": remaining,
        "pct": min(1.0, spend / threshold),
        "waived": remaining == 0,
        "annual_fee": float(card.get("annual_fee", 0) or 0),
        **extra,
    }
