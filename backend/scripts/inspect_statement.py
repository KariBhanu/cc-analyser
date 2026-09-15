"""Show what the parser actually sees in a statement PDF.

    python scripts/inspect_statement.py ~/Downloads/statement.pdf
    python scripts/inspect_statement.py statement.pdf --card millennia
    python scripts/inspect_statement.py statement.pdf --password ABCD1234
    python scripts/inspect_statement.py statement.pdf --full

--card looks up a saved card by issuer/name and uses the password stored
against it, the same way the upload endpoint does, so you don't have to retype
it. --list-cards shows what's available.

When a statement parses to "total: —", the useful question is what text came
out of the PDF. By default this prints only the lines that mention money
keywords plus the first few lines -- enough to fix the pattern, without
dumping your whole statement to the terminal. --full prints everything.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pdfplumber  # noqa: E402

from app.services.statements import (  # noqa: E402
    _TOTAL_KEYWORDS,
    amounts_in,
    guess_note,
    guess_period,
    guess_points,
    guess_total,
)

# Anything that smells like a summary figure, so we can show near-misses too.
INTERESTING = _TOTAL_KEYWORDS + [
    "total", "due", "balance", "payable", "outstanding", "spend", "purchase",
    "points", "reward",
]


def _saved_password(needle: str):
    """(password, label) for the saved card matching `needle`, or (None, reason)."""
    from app.deps import store
    from app.security import decrypt

    cards = store.list("cards")
    if not cards:
        return None, "no cards saved yet"
    matches = [
        c for c in cards
        if needle.lower() in f"{c.get('issuer', '')} {c.get('name', '')}".lower()
    ]
    if not matches:
        names = ", ".join(f"{c.get('issuer')} {c.get('name')}" for c in cards)
        return None, f"no card matching {needle!r}. Saved cards: {names}"
    if len(matches) > 1:
        names = ", ".join(f"{c.get('issuer')} {c.get('name')}" for c in matches)
        return None, f"{needle!r} matches several cards: {names}"
    card = matches[0]
    label = f"{card.get('issuer')} {card.get('name')}"
    enc = card.get("statement_password_enc")
    if not enc:
        return None, f"{label} has no saved statement password"
    return decrypt(enc), label


def _explain_transactions(lines: list) -> int:
    """Show which lines look like transactions, and why the rest were rejected.

    A row has to start with a date AND end with an amount. When nothing is
    found, knowing which of those two failed is the whole diagnosis.
    """
    from app.services.statements import (
        _LEADING_TIME, _TXN_LINE, _TXN_SKIP, _trailing_amount,
        extract_transactions, merchant_of,
    )

    accepted = extract_transactions("\n".join(lines))
    print(f"\nextract_transactions() found: {len(accepted)}")

    starts_with_date = [ln for ln in lines if _TXN_LINE.match(ln)]
    print(f"lines starting with a date  : {len(starts_with_date)}")

    if not starts_with_date:
        print(
            "\nNo line starts with a recognised date, so no row can be a transaction.\n"
            "Either the itemised pages didn't extract as text, or the dates use a\n"
            "format we don't parse. Run with --full and look at how a spend row\n"
            "actually appears."
        )
        return 0

    print("\n─── every line that starts with a date ───")
    for ln in starts_with_date:
        m = _TXN_LINE.match(ln)
        rest = m.group(2).strip()
        low = ln.lower()
        skipped = next((s for s in _TXN_SKIP if s in low), None)
        amount, marker, head = _trailing_amount(rest)
        if skipped:
            verdict = f"SKIPPED  (summary row: matched {skipped!r})"
        elif amount is None:
            verdict = "REJECTED (no amount at end of line)"
        else:
            desc = _LEADING_TIME.sub("", head.strip()).strip(" .-\t")
            verdict = (
                f"OK  {merchant_of(desc)} / {amount:,.2f}{' ' + marker.upper() if marker else ''}"
                if desc else "REJECTED (no description before the amount)"
            )
        print(f"  {ln[:88]}\n     -> {verdict}")

    if accepted:
        print("\n─── parsed ───")
        for t in accepted:
            flag = "CR" if t["credit"] else "  "
            print(f"  {t['date']}  {t['merchant']:<14} {t['amount']:>10,.2f} {flag}  {t['description'][:40]}")
    else:
        print(
            "\nNothing was accepted. The 'REJECTED (no amount...)' lines above are the\n"
            "interesting ones -- paste a couple and the row format can be supported."
        )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, nargs="?")
    ap.add_argument("--password", default="", help="PDF password, if protected")
    ap.add_argument("--card", help="use the password saved against this card")
    ap.add_argument("--list-cards", action="store_true", help="show saved cards and exit")
    ap.add_argument("--full", action="store_true", help="print all extracted text")
    ap.add_argument("--transactions", action="store_true",
                    help="explain, line by line, why rows were or weren't read as transactions")
    args = ap.parse_args()

    if args.list_cards:
        from app.deps import store

        cards = store.list("cards")
        if not cards:
            print("No cards saved.")
        for c in cards:
            has = "password saved" if c.get("statement_password_enc") else "no password"
            print(f"  {c.get('issuer')} {c.get('name')}  ({has})")
        return 0

    if args.pdf is None:
        ap.error("a PDF path is required (or use --list-cards)")
    if not args.pdf.exists():
        print(f"No such file: {args.pdf}")
        return 1

    password = args.password
    if args.card and not password:
        password, why = _saved_password(args.card)
        if password is None:
            print(f"Could not use a saved password: {why}")
            return 1
        print(f"using the password saved for {why}\n")

    try:
        with pdfplumber.open(args.pdf, password=password) as pdf:
            pages = [(p.extract_text() or "") for p in pdf.pages]
    except Exception as exc:  # noqa: BLE001
        print(f"Could not open the PDF: {exc}")
        if "password" in str(exc).lower() or "encrypt" in str(exc).lower():
            print("It looks encrypted — pass --password.")
        return 1

    text = "\n".join(pages)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    print(f"pages          : {len(pages)}")
    print(f"characters     : {len(text)}")
    print(f"non-blank lines: {len(lines)}")

    if not text.strip():
        print(
            "\nNo text at all. This is almost certainly a scanned/image-only PDF —\n"
            "pdfplumber cannot read those. Enter the figures manually, or run the\n"
            "file through OCR first."
        )
        return 0

    start, end = guess_period(text)
    dash = "— (not found)"
    print(f"\ntotal          : {guess_total(text) or dash}")
    print(f"points earned  : {guess_points(text) or dash}")
    print(f"period start   : {start or dash}")
    print(f"period end     : {end or dash}")
    print(f"suggested note : {guess_note(start, end) or dash}")

    if args.transactions:
        return _explain_transactions(lines)

    if args.full:
        print("\n─── full extracted text ───")
        for i, ln in enumerate(lines):
            print(f"{i:4} | {ln}")
        return 0

    print("\n─── first 5 lines ───")
    for i, ln in enumerate(lines[:5]):
        print(f"{i:4} | {ln}")

    print("\n─── lines mentioning money/points/period keywords ───")
    # Print the line after a hit too: reward-point summaries put the labels on
    # a header row and the figures on the row beneath, so the interesting
    # number is on a line that matches no keyword at all.
    show = set()
    for i, ln in enumerate(lines):
        if any(k in ln.lower() for k in INTERESTING):
            show.update({i, i + 1})
    if not show:
        print("(none — the statement may use wording we don't look for yet)")
    prev = None
    for i in sorted(x for x in show if x < len(lines)):
        if prev is not None and i > prev + 1:
            print("     ...")
        amts = amounts_in(lines[i])
        marker = f"   -> amounts: {amts}" if amts else ""
        print(f"{i:4} | {lines[i]}{marker}")
        prev = i

    print(
        "\nIf the right figure is visible above but guess_total() said '—',\n"
        "paste just the matching line(s) and the label wording can be added.\n"
        "Run with --full to see everything."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
