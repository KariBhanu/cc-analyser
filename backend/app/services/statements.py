"""Best-effort statement PDF parsing.

v1 reality check (Indian cards): statements are password-protected PDFs whose
layouts differ per bank. We do a GENERIC extraction (open with password, pull
text, guess the total + dates) and return it as a *draft* for the user to
confirm/correct -- we never silently trust the guess. Per-bank parsers can be
added later keyed off the issuer.
"""
import io
import re
from typing import Optional

import pdfplumber

_AMOUNT = r"([\d,]+\.\d{2})"
_TOTAL_KEYWORDS = [
    "total amount due",
    "total dues",
    "total payment due",
    "total amount payable",
    "closing balance",
]


def _to_float(s: str) -> float:
    return float(s.replace(",", ""))


def parse_statement(data: bytes, password: Optional[str]) -> dict:
    """Return {ok, guessed_total, dates[], text_preview} or {ok: False, error, needs_password}."""
    try:
        with pdfplumber.open(io.BytesIO(data), password=password or "") as pdf:
            text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception as exc:  # noqa: BLE001 - surface any open/decrypt failure to the user
        msg = str(exc)
        needs_pw = "password" in msg.lower() or "encrypt" in msg.lower()
        return {
            "ok": False,
            "error": "Wrong or missing PDF password." if needs_pw else f"Could not read PDF: {msg}",
            "needs_password": needs_pw,
        }

    guessed_total = None
    for kw in _TOTAL_KEYWORDS:
        m = re.search(kw + r"[^\d]{0,20}" + _AMOUNT, text, re.IGNORECASE)
        if m:
            guessed_total = _to_float(m.group(1))
            break

    dates = re.findall(r"\d{2}[/-]\d{2}[/-]\d{2,4}", text)

    return {
        "ok": True,
        "guessed_total": guessed_total,
        "dates": dates[:6],
        "text_preview": text[:2000],
    }
