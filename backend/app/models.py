"""Request/response schemas. Storage holds plain dicts; these validate the edges."""
from typing import Optional

from pydantic import BaseModel, Field


class MerchantBonus(BaseModel):
    merchant: str                       # e.g. "Amazon", "Swiggy"
    points_per_100: float               # reward points earned per Rs.100 spent here


class CardIn(BaseModel):
    issuer: str                         # e.g. "HDFC"
    name: str                           # e.g. "Millennia"
    # When set, every reward term below is filled from backend/catalog rather
    # than trusted from the client -- the user only tells us which card they
    # hold. Left optional so a hand-entered card still works.
    catalog_slug: Optional[str] = None
    annual_fee: float = 0
    waiver_threshold: float = 0         # annual spend (Rs) that waives the fee; 0 = none
    base_points_per_100: float = 0      # default reward points per Rs.100
    rupee_per_point: float = 1.0        # ONE conversion rate per card (user-supplied)
    merchant_bonuses: list[MerchantBonus] = []
    base_monthly_cap: Optional[float] = None    # max BASE reward points/month (None = uncapped)
    bonus_monthly_cap: Optional[float] = None   # max BONUS (partner) reward points/month, shared
    statement_password: Optional[str] = None   # plaintext in; stored encrypted
    statement_cycle_day: Optional[int] = None  # day of month the statement generates
    # When the card was opened. The annual fee is assessed on the card's own
    # membership year (anniversary to anniversary), not the financial year, so
    # the waiver can't be tracked accurately without this.
    opened_on: Optional[str] = None            # "YYYY-MM" (preferred) or "YYYY-MM-DD"


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
    opened_on: Optional[str] = None


class SignupIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., max_length=254)
    phone: str = Field(..., max_length=20)      # Indian mobile; normalised to +91XXXXXXXXXX
    password: str = Field(..., min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: str = Field(..., max_length=254)
    password: str = Field(..., max_length=200)


class VerifyOtpIn(BaseModel):
    channel: str = Field(..., pattern="^(email|phone)$")
    code: str = Field(..., min_length=4, max_length=10)


class ResendOtpIn(BaseModel):
    channel: str = Field(..., pattern="^(email|phone)$")


class AssistantQuery(BaseModel):
    query: str = Field(..., max_length=500)   # free text; parsed by services/assistant.py


class Transaction(BaseModel):
    date: Optional[str] = None          # ISO date string
    description: str = ""
    merchant: Optional[str] = None      # short label, e.g. "Swiggy"
    amount: float = 0
    credit: bool = False                # refund / payment, not spend


class StatementIn(BaseModel):
    card_id: str
    period_start: Optional[str] = None  # ISO date string
    period_end: Optional[str] = None
    total_spend: float
    points_earned: Optional[float] = None  # if omitted, estimated from spend x rate
    note: Optional[str] = None
    transactions: list[Transaction] = []


class StatementUpdate(BaseModel):
    """Editable statement summary fields; linked transactions stay untouched."""
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    total_spend: float
    points_earned: Optional[float] = None
    note: Optional[str] = None
