"""Dashboard aggregations + the two analysis features."""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ..deps import get_current_user, store
from ..services import rewards

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(user: str = Depends(get_current_user)):
    """Per-card totals (spend, rewards) + fee-waiver progress, plus grand totals."""
    cards = store.list("cards", user)
    statements = store.list("statements", user)

    per_card = []
    grand_spend = grand_reward = 0.0
    for c in cards:
        cs = [s for s in statements if s.get("card_id") == c["id"]]
        spend = sum(float(s.get("total_spend", 0)) for s in cs)
        reward = sum(float(s.get("reward_value", 0)) for s in cs)
        fy_spend = rewards.spend_in_current_fy(cs)
        per_card.append({
            "card_id": c["id"],
            "issuer": c.get("issuer"),
            "name": c.get("name"),
            "total_spend": spend,
            "total_reward": reward,
            "statement_count": len(cs),
            "fee_waiver": rewards.fee_waiver_status(c, fy_spend),
        })
        grand_spend += spend
        grand_reward += reward

    return {"cards": per_card, "totals": {"spend": grand_spend, "reward": grand_reward}}


@router.get("/best-card")
async def best_card(
    merchant: Optional[str] = Query(None, description="e.g. Amazon, Flipkart, Swiggy"),
    amount: float = Query(1000, description="Hypothetical spend amount in Rs"),
    user: str = Depends(get_current_user),
):
    """Rank the user's cards by real rupee reward for a merchant/amount."""
    cards = store.list("cards", user)
    ranked = []
    for c in cards:
        rate = rewards.reward_rate_for_merchant(c, merchant)
        v100 = rewards.value_per_100(c, merchant)
        ranked.append({
            "card_id": c["id"],
            "issuer": c.get("issuer"),
            "name": c.get("name"),
            "points_per_100": rate,
            "rupee_per_point": float(c.get("rupee_per_point", 1.0)),
            "value_per_100": v100,
            "estimated_reward": amount / 100.0 * v100,
        })
    ranked.sort(key=lambda r: r["estimated_reward"], reverse=True)
    return {"merchant": merchant, "amount": amount, "ranking": ranked}
