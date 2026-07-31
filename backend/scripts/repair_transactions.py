"""Re-derive transactions stored by the pre-fix parser.

    python scripts/repair_transactions.py            # dry run
    python scripts/repair_transactions.py --apply

Rows saved before the two-amount-column fix took the RIGHT-most figure on the
line. On Axis statements that is the cashback column, so a Rs.20,538 purchase
was stored as Rs.308 -- and as a credit, because the cashback column is Cr.

The real figure survives: the old code sliced the description at the amount it
picked, leaving the true amount as trailing text:

    description "SWIGGY LIMITED,BANGALORE RESTAURANTS 513.00 Dr", amount 21.00

So a row is repairable when its description still ends in an amount. Re-running
the corrected reader over that description recovers the amount, the Dr/Cr and a
clean description. Rows whose description holds no trailing amount are left
alone -- they were either parsed correctly or can't be recovered here.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.deps import store  # noqa: E402
from app.services.statements import (  # noqa: E402
    _CREDIT_HINTS,
    _LEADING_TIME,
    _trailing_amount,
    merchant_of,
)

COLLECTION = "transactions"


def repaired(txn: dict):
    """The corrected fields for a row, or None if it needs no repair."""
    description = (txn.get("description") or "").strip()
    amount, marker, head = _trailing_amount(description)
    if amount is None:
        return None  # no trailing amount -> nothing stranded, leave it
    if not marker:
        # Require an explicit Dr/Cr. The old parser always sliced at a marked
        # column, so a stranded amount carries one. A bare trailing number is
        # ordinary description text -- the "5" ending a reference like
        # ...A4UER5, or the "427" in CASHBACK CREDIT MAR26-...~OTHERS:427 --
        # and those rows are already correct. Repairing them would replace a
        # good amount with a fragment of the description.
        return None

    clean = " ".join(_LEADING_TIME.sub("", head.strip()).strip(" .-\t").split())
    if not clean:
        return None

    credit = marker == "cr" if marker else any(h in description.lower() for h in _CREDIT_HINTS)
    if amount == txn.get("amount") and credit == txn.get("credit") and clean == description:
        return None
    return {
        "description": clean,
        "merchant": merchant_of(clean),
        "amount": amount,
        "credit": credit,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write, instead of dry run")
    args = ap.parse_args()

    rows = store.list(COLLECTION)
    print(f"{len(rows)} transaction(s) stored\n")

    fixed = 0
    for txn in sorted(rows, key=lambda r: r.get("date") or ""):
        patch = repaired(txn)
        if not patch:
            continue
        fixed += 1
        was = f"{txn.get('amount'):>10,.2f} {'CR' if txn.get('credit') else 'DR'}"
        now = f"{patch['amount']:>10,.2f} {'CR' if patch['credit'] else 'DR'}"
        print(f"  {txn.get('date')}  {was}  ->  {now}   {patch['description'][:46]}")
        if args.apply:
            store.update(COLLECTION, txn["id"], patch, txn.get("user"))

    verb = "repaired" if args.apply else "would repair"
    print(f"\n{verb} {fixed} of {len(rows)} row(s); {len(rows) - fixed} already correct")
    if not args.apply and fixed:
        print("dry run -- re-run with --apply to write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
