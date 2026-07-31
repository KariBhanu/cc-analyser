"""Query analysis behind the Assistant screen.

Deliberately NOT a language model. It pulls an amount and (optionally) one of the
user's own bonus merchants out of the query text, picks an intent from keywords,
then answers using the same `rewards` engine the rest of the app uses. Every
figure it reports is derived from the user's own cards and statements -- nothing
is generated, and nothing leaves the server.

If an LLM is wired in later, `answer()` is the seam: keep the response envelope
and swap the intent/param extraction.
"""
import re
from typing import Optional

from . import rewards

ENGINE = "SmartCred Analysis"

# Suffix multipliers used in Indian amount shorthand ("1.45L", "45k", "2cr").
_MULTIPLIERS = {
    "k": 1_000,
    "l": 100_000,
    "lakh": 100_000,
    "lakhs": 100_000,
    "lac": 100_000,
    "cr": 10_000_000,
    "crore": 10_000_000,
    "crores": 10_000_000,
}

_AMOUNT_RE = re.compile(
    r"(?:(?P<cur>₹|rs\.?|inr)\s*)?"
    r"(?P<num>\d[\d,]*(?:\.\d+)?)"
    r"\s*(?P<suffix>k|lakhs|lakh|lac|l|crores|crore|cr)?\b",
    re.IGNORECASE,
)

_WAIVER_WORDS = ("waiver", "waive", "annual fee", "threshold", "milestone")
_STATEMENT_WORDS = ("statement", "spend review", "audit", "last month", "billed")
_OPTIMIZE_WORDS = (
    "which card", "best card", "maximize", "maximise", "optimize", "optimise",
    "should i use", "most reward", "highest reward", "compare",
)


def parse_amount(query: str) -> Optional[float]:
    """Pull a spend amount out free text.

    Prefers matches that are unambiguous -- ones carrying a currency marker
    (₹1,45,000) or a magnitude suffix (1.45L, 45k). Only if none exist does it
    fall back to the largest bare number, and then only at 500+, so that a
    stray year or quantity ("July 2024", "3 cards") isn't read as rupees.
    """
    marked: list[float] = []
    bare: list[float] = []
    for m in _AMOUNT_RE.finditer(query):
        try:
            value = float(m.group("num").replace(",", ""))
        except ValueError:
            continue
        suffix = (m.group("suffix") or "").lower()
        if suffix:
            value *= _MULTIPLIERS[suffix]
        if m.group("cur") or suffix:
            marked.append(value)
        else:
            bare.append(value)
    if marked:
        return max(marked)
    big = [v for v in bare if v >= 500]
    return max(big) if big else None


def detect_merchant(query: str, cards: list[dict]) -> Optional[str]:
    """Match the query against merchants the user actually configured a bonus for.

    We only recognise the user's own merchant names -- the app has no category
    taxonomy, so inventing one here would produce rates the engine can't back up.
    Longest name first, so "Amazon Pay" beats "Amazon".
    """
    names = {
        b.get("merchant", "").strip()
        for c in cards
        for b in c.get("merchant_bonuses", [])
        if b.get("merchant", "").strip()
    }
    low = query.lower()
    for name in sorted(names, key=len, reverse=True):
        if re.search(rf"\b{re.escape(name.lower())}\b", low):
            return name
    return None


def detect_intent(query: str, amount: Optional[float]) -> str:
    low = query.lower()
    if any(w in low for w in _WAIVER_WORDS):
        return "waiver"
    if any(w in low for w in _STATEMENT_WORDS):
        return "statement"
    if any(w in low for w in _OPTIMIZE_WORDS) or amount is not None:
        return "optimize"
    return "help"


def _rupee(value: float) -> str:
    """Indian-grouped rupees, e.g. 145000 -> ₹1,45,000."""
    whole = int(round(value))
    s = str(abs(whole))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return f"{'-' if whole < 0 else ''}₹{s}"


def _optimize(query: str, cards: list[dict], statements: list[dict], amount: Optional[float],
              merchant: Optional[str]) -> dict:
    spend = amount if amount is not None else 1000.0
    ranked = []
    for c in cards:
        rpp = float(c.get("rupee_per_point", 1.0))
        est = rewards.capped_reward_for_spend(c, spend, merchant)
        ranked.append({
            "card": c,
            "rate": est["rate"],
            "value_per_100": rewards.value_per_100(c, merchant),
            "reward": est["points"] * rpp,
            "capped": est["capped"],
            "cap_rupees": (est["cap_points"] * rpp) if est["cap_points"] is not None else None,
        })
    ranked.sort(key=lambda r: r["reward"], reverse=True)

    rows = []
    for r in ranked:
        c = r["card"]
        note = " (capped)" if r["capped"] else ""
        rows.append({
            "cells": [
                f"{c.get('issuer', '')} {c.get('name', '')}".strip(),
                f"{r['value_per_100']:.1f}%",
                f"{_rupee(r['reward'])}{note}",
            ],
            "highlight": r is ranked[0],
        })

    noun = "card" if len(cards) == 1 else "cards"
    at_merchant = f" at {merchant}" if merchant else ""
    headline = f"Comparing {len(cards)} {noun}{at_merchant} for a {_rupee(spend)} spend."
    if merchant:
        detail = f"Bonus rates applied for {merchant} where you set one up."
    else:
        detail = (
            "No matching merchant bonus found in your query, so these are base rates. "
            "Add a merchant bonus on the Cards screen to model one."
        )

    if not ranked:
        return {
            "headline": "You have no cards saved yet.",
            "detail": detail,
            "columns": [],
            "rows": [],
            "recommendation": "Add a card on the Cards screen first, then ask again.",
        }

    best = ranked[0]
    bc = best["card"]
    parts = [
        f"Use your {bc.get('issuer', '')} {bc.get('name', '')}".strip()
        + f" — {_rupee(best['reward'])} back on {_rupee(spend)}"
        + f" ({best['value_per_100']:.1f}% effective)."
    ]
    if best["capped"]:
        parts.append(
            f"Reward is limited by this card's monthly cap of {_rupee(best['cap_rupees'])}"
            " (assumes no other spend this month)."
        )
    runner = ranked[1] if len(ranked) > 1 else None
    if runner and runner["reward"] < best["reward"]:
        parts.append(
            f"That is {_rupee(best['reward'] - runner['reward'])} better than the next option,"
            f" {runner['card'].get('issuer', '')} {runner['card'].get('name', '')}.".replace("  ", " ")
        )
    # The design showed "milestone" progress; here it's the real fee-waiver threshold.
    cs = [s for s in statements if s.get("card_id") == bc.get("id")]
    w = rewards.fee_waiver_status(bc, rewards.waiver_window(bc, cs))
    if w["applicable"] and not w["waived"]:
        after = min(1.0, (w["fy_spend"] + spend) / w["threshold"])
        parts.append(
            f"It also takes this card to {after * 100:.0f}% of its"
            f" {_rupee(w['threshold'])} annual fee-waiver target."
        )

    return {
        "headline": headline,
        "detail": detail,
        "columns": ["Card", "Reward Rate", "You'd Earn"],
        "rows": rows,
        "recommendation": " ".join(parts),
    }


def _waiver(cards: list[dict], statements: list[dict]) -> dict:
    tracked = []
    for c in cards:
        cs = [s for s in statements if s.get("card_id") == c.get("id")]
        w = rewards.fee_waiver_status(c, rewards.waiver_window(c, cs))
        if w["applicable"]:
            tracked.append((c, w))

    if not tracked:
        return {
            "headline": "No fee-waiver thresholds are set up.",
            "detail": "None of your cards has a yearly spend threshold recorded.",
            "columns": [],
            "rows": [],
            "recommendation": (
                "Set 'Spend to waive fee' on a card in the Cards screen to track progress here."
            ),
        }

    tracked.sort(key=lambda t: t[1]["remaining"])
    rows = [
        {
            "cells": [
                f"{c.get('issuer', '')} {c.get('name', '')}".strip(),
                f"{_rupee(w['fy_spend'])} / {_rupee(w['threshold'])}",
                "WAIVED" if w["waived"] else f"{_rupee(w['remaining'])} to go",
            ],
            "highlight": not w["waived"] and i == 0,
        }
        for i, (c, w) in enumerate(tracked)
    ]

    pending = [(c, w) for c, w in tracked if not w["waived"]]
    if not pending:
        rec = "Every threshold is met — no annual fees left to clear this financial year."
    else:
        c, w = pending[0]
        rec = (
            f"Closest to a waiver: {c.get('issuer', '')} {c.get('name', '')}".strip()
            + f" — spend {_rupee(w['remaining'])} more this financial year to clear its"
            + f" {_rupee(w.get('annual_fee', 0))} fee."
        )

    return {
        "headline": f"Checking {len(tracked)} fee-waiver {'target' if len(tracked) == 1 else 'targets'} for this financial year.",
        "detail": "The financial year runs 1 Apr – 31 Mar. Only statements dated in that range count.",
        "columns": ["Card", "Spent / Target", "Status"],
        "rows": rows,
        "recommendation": rec,
    }


def _statement(cards: list[dict], statements: list[dict]) -> dict:
    if not statements:
        return {
            "headline": "You have no statements saved yet.",
            "detail": "",
            "columns": [],
            "rows": [],
            "recommendation": "Add a statement on the Statements screen, then ask again.",
        }

    by_id = {c.get("id"): c for c in cards}
    latest = sorted(
        statements,
        key=lambda s: str(s.get("period_end") or s.get("created_at") or ""),
        reverse=True,
    )[:5]

    rows = [
        {
            "cells": [
                (lambda c: f"{c.get('issuer', '')} {c.get('name', '')}".strip() if c else "Unknown card")(
                    by_id.get(s.get("card_id"))
                ),
                _rupee(float(s.get("total_spend", 0))),
                _rupee(float(s.get("reward_value", 0))),
            ],
            "highlight": i == 0,
        }
        for i, s in enumerate(latest)
    ]

    top = latest[0]
    card = by_id.get(top.get("card_id"))
    spend = float(top.get("total_spend", 0))
    reward = float(top.get("reward_value", 0))
    effective = (reward / spend * 100) if spend else 0.0
    period = top.get("period_end") or (top.get("created_at") or "")[:10] or "undated"

    return {
        "headline": f"Showing your {len(latest)} most recent {'statement' if len(latest) == 1 else 'statements'}.",
        "detail": f"Most recent statement date: {period}.",
        "columns": ["Card", "Spend", "Rewards"],
        "rows": rows,
        "recommendation": (
            f"Most recent: {card.get('issuer', '')} {card.get('name', '')}".strip() if card else "Most recent"
        ) + (
            f" — {_rupee(spend)} spent, {_rupee(reward)} earned"
            f" ({effective:.1f}% effective return)."
        ),
    }


def _help(cards: list[dict]) -> dict:
    merchants = sorted({
        b.get("merchant", "").strip()
        for c in cards
        for b in c.get("merchant_bonuses", [])
        if b.get("merchant", "").strip()
    })
    sample = merchants[0] if merchants else "a merchant you configured a bonus for"
    return {
        "headline": "I could not tell what you are asking for.",
        "detail": "This works by matching keywords and an amount — it is not a language model.",
        "columns": [],
        "rows": [],
        "recommendation": (
            "Try 'which card for ₹1,45,000 at " + sample + "?' to compare cards, "
            "'check fee waiver progress' to see how close you are to waiving a fee, or "
            "'review my last statement' to look at recent statements."
        ),
    }


def answer(query: str, cards: list[dict], statements: list[dict]) -> dict:
    """Analyse `query` against the user's own data and return a render-ready result."""
    amount = parse_amount(query)
    merchant = detect_merchant(query, cards)
    intent = detect_intent(query, amount)

    if intent == "optimize":
        body = _optimize(query, cards, statements, amount, merchant)
    elif intent == "waiver":
        body = _waiver(cards, statements)
    elif intent == "statement":
        body = _statement(cards, statements)
    else:
        body = _help(cards)

    return {
        "engine": ENGINE,
        "intent": intent,
        "query": query,
        "amount": amount,
        "merchant": merchant,
        **body,
    }
