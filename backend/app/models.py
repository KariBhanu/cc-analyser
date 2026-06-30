"""Request/response schemas. Storage holds plain dicts; these validate the edges."""
from typing import Optional

from pydantic import BaseModel, Field


class MerchantBonus(BaseModel):
    merchant: str                       # e.g. "Amazon", "Swiggy"
    points_per_100: float               # reward points earned per Rs.100 spent here


class CardIn(BaseModel):
    issuer: str                         # e.g. "HDFC"
    name: str                           # e.g. "Millennia"
    annual_fee: float = 0
    waiver_threshold: float = 0         # annual spend (Rs) that waives the fee; 0 = none
    base_points_per_100: float = 0      # default reward points per Rs.100
    rupee_per_point: float = 1.0        # ONE conversion rate per card (user-supplied)
    merchant_bonuses: list[MerchantBonus] = []
    base_monthly_cap: Optional[float] = None    # max BASE reward points/month (None = uncapped)
    bonus_monthly_cap: Optional[float] = None   # max BONUS (partner) reward points/month, shared
    statement_password: Optional[str] = None   # plaintext in; stored encrypted
    statement_cycle_day: Optional[int] = None  # day of month the statement generates


class CardUpdate(BaseModel):
    issuer: Optional[str] = None
    name: Optional[str] = None
    annual_fee: Optional[float] = None
    waiver_threshold: Optional[float] = None
    base_points_per_100: Optional[float] = None
    rupee_per_point: Optional[float] = None
    merchant_bonuses: Optional[list[MerchantBonus]] = None
    base_monthly_cap: Optional[float] = None
    bonus_monthly_cap: Optional[float] = None
    statement_password: Optional[str] = None
    statement_cycle_day: Optional[int] = None


class StatementIn(BaseModel):
    card_id: str
    period_start: Optional[str] = None  # ISO date string
    period_end: Optional[str] = None
    total_spend: float
    points_earned: Optional[float] = None  # if omitted, estimated from spend x rate
    note: Optional[str] = None
