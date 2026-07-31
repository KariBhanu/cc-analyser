"""Best-effort statement PDF parsing.

v1 reality check (Indian cards): statements are password-protected PDFs whose
layouts differ per bank. We do a GENERIC extraction (open with password, pull
text, guess the total + dates) and return it as a *draft* for the user to
confirm/correct -- we never silently trust the guess. Per-bank parsers can be
added later keyed off the issuer.

Total extraction is line-oriented rather than one flat regex over the whole
document. In a real statement the label and its value sit at opposite ends of a
table row, so extract_text leaves a lot of padding between them, and the value
often wraps onto the following line -- both of which a fixed-distance
`keyword.{0,20}amount` pattern misses.
"""
import io
import re
from datetime import date
from typing import Optional

import pdfplumber

# An amount has to look like money, not like a year or a day of the month:
# either comma-grouped (Indian 1,23,456 or Western 123,456) or carrying
# decimals. Without that, the "2026" inside a date is a perfectly good "total".
_AMOUNT = re.compile(
    r"(?:(?:₹|Rs\.?|INR)\s*)?"
    r"(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{2})"
)

# Ordered most specific first: an exact "total amount due" should win over a
# bare "amount due", which in turn beats "closing balance".
_TOTAL_KEYWORDS = [
    "total amount due",
    "total amount payable",
    "total payment due",
    "total dues",
    "total due",
    "net amount due",
    "total outstanding",
    "amount due",
    "closing balance",
    "grand total",
]

# Lines that mention a total keyword but never hold the figure we want.
_TOTAL_EXCLUDE = ("minimum", "min amt", "min due", "previous", "last statement")

# ── Reward points ────────────────────────────────────────────────────────────
# Points are usually bare integers ("450"), so the money pattern above -- which
# insists on commas or decimals -- won't see them. Require that the number is
# not touching a / or - so we don't read "21" out of 21/06/2026.
_POINTS = re.compile(r"(?<![\d/\-.])(\d{1,3}(?:,\d{2,3})*|\d+)(?![\d/\-])")

_POINTS_KEYWORDS = [
    # Cashback cards report rupees rather than points; it's the same field to us.
    "cashback earned",
    "total cashback earned",
    "reward points earned",
    "points earned",
    "earned this cycle",
    "earned this statement",
    "reward points for this statement",
    "points accumulated",
    "points accrued",
    "points credited",
    "total points earned",
    "bonus points earned",
    "reward points",
    # Bare column header in a Reward Points Summary table. Last, because on its
    # own it is the weakest signal.
    "earned",
]

# "Points earned" is what we want; balances and redemptions are not.
_POINTS_EXCLUDE = (
    "redeem", "opening", "closing", "balance", "expir", "lapsed",
    "available", "outstanding", "brought forward", "carried forward",
)

# ── Statement period ─────────────────────────────────────────────────────────
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# 21/06/2026, 21-06-26, 21.06.2026, 21-Jun-2026, 21 Jun 2026
_DATE = re.compile(
    r"\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})\b"
    r"|\b(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{2,4})\b"
)

_PERIOD_KEYWORDS = [
    "statement period", "billing period", "billing cycle", "statement cycle",
    "period from", "for the period", "transactions from",
    "statement for the period", "transactions for the period",
    "from date", "period", "from",
]

# The single date that marks the end of the cycle, when no range is printed.
# Payment due date is deliberately absent -- it falls after the cycle closes.
_END_KEYWORDS = [
    "statement date", "statement generation date", "bill date",
    "statement generated on", "billing date",
]


def _to_float(s: str) -> float:
    return float(s.replace(",", ""))


def _iso(day: int, month: int, year: int) -> Optional[str]:
    """YYYY-MM-DD, or None if the numbers can't be a real date."""
    if year < 100:
        year += 2000
    if not (1 <= month <= 12 and 1 <= day <= 31 and 1990 <= year <= 2100):
        return None
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def find_dates(text: str) -> list:
    """Every parseable date in the text, as ISO strings, in order of appearance.

    Day-first throughout: these are Indian statements, where 05/07/2026 is the
    5th of July. Guessing per-date would make the output inconsistent.
    """
    out = []
    for m in _DATE.finditer(text):
        if m.group(1):
            iso = _iso(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        else:
            month = _MONTHS.get(m.group(5)[:3].lower())
            iso = _iso(int(m.group(4)), month, int(m.group(6))) if month else None
        if iso:
            out.append(iso)
    return out


def _looks_like_header(line: str) -> bool:
    """A row of column titles rather than a label/value pair.

        Opening Balance   Earned   Redeemed   Closing Balance

    Mostly words, few digits, several columns."""
    return len(re.findall(r"\d", line)) <= 4 and len(line.split()) >= 2


# Column titles seen in reward-point summary tables, longest alternative first
# so "opening balance" wins over a bare "balance".
_COLUMN_PATTERNS = [
    ("earned", r"(?:reward\s+|bonus\s+)?points\s+earned|earned(?:\s+this\s+\w+)?|accrued|accumulated"),
    ("opening", r"opening(?:\s+balance)?|previous(?:\s+balance)?|balance\s+b/?f|brought\s+forward"),
    # HDFC says "Disbursed" where others say "Redeemed".
    ("redeemed", r"(?:points\s+)?redeemed|redemptions?|disbursed|utilised|utilized"),
    ("adjusted", r"adjusted|adjustments?|reversed"),
    ("expired", r"expired|lapsed"),
    # Cashback cards (Axis ACE) print "Cashback Earned | Cashback Credited".
    ("credited", r"credited|paid\s+out"),
    ("closing", r"closing(?:\s+balance)?|balance\s+c/?f|carried\s+forward|total\s+points|available"),
]
_COLUMN_RE = [(kind, re.compile(pat)) for kind, pat in _COLUMN_PATTERNS]


def _header_columns(header: str) -> list:
    """Column kinds in the order they appear, e.g. ['opening','earned','closing'].

    Matched spans are non-overlapping, so "Opening Balance" is one column
    rather than an 'opening' plus a stray 'balance'.

    Slash-joined titles are collapsed first: "Adjusted/Lapsed" is a single
    column with a single figure under it, but would otherwise be counted twice
    and throw the column-to-value alignment out by one.
    """
    cleaned = re.sub(r"/\s*[A-Za-z]+", "", header.lower())
    hits = []
    for kind, rx in _COLUMN_RE:
        for m in rx.finditer(cleaned):
            hits.append((m.start(), m.end(), kind))
    hits.sort()
    columns, last_end = [], -1
    for start, end, kind in hits:
        if start >= last_end:
            columns.append(kind)
            last_end = end
    return columns


# Other column titles that mark a line as a reward-points summary header.
_SUMMARY_COLUMNS = ("opening", "closing", "redeemed", "balance", "adjusted", "expired")

_EARNED_HEADER = re.compile(r"\b((?:reward\s+|bonus\s+)?points\s+earned|earned)\b")


def _points_from_table(lines: list) -> Optional[float]:
    """Read the "Earned" column out of a Reward Points Summary table.

        Opening Balance   Earned   Redeemed   Closing Balance
                 12,000      452          0            12,452

    Matched by column *index*, not character offset: pdfplumber's extract_text
    collapses runs of spaces, so the above arrives as "Opening Balance Earned
    Redeemed Closing Balance" / "12,000 452 0 12,452" and x-positions are gone.
    Counting columns survives that.

    Deliberately separate from the labelled-line scan, which has to treat
    "Balance" and "Redeemed" as disqualifying -- a header row legitimately
    contains both.
    """
    for i, line in enumerate(lines):
        if not _looks_like_header(line):
            continue
        columns = _header_columns(line)
        if "earned" not in columns or len(columns) < 2:
            continue
        index = columns.index("earned")

        # The value row isn't always the very next line. HDFC prints the
        # closing balance on its own line between the header and the figures:
        #
        #   Reward Points Opening Balance Earned Disbursed Adjusted/Lapsed
        #   2,529
        #   2,174 355 0 0
        #
        # so keep looking until a row's number count matches the columns.
        for nxt in lines[i + 1: i + 5]:
            # More than a stray letter or two means we've run past the table.
            if len(re.findall(r"[A-Za-z]", nxt)) > 3:
                break
            numbers = _POINTS.findall(nxt)
            # Require an exact column/value match. A blank cell shifts every
            # index after it, so anything else means we cannot say which number
            # is which -- better to return nothing than a confident wrong one.
            if len(numbers) == len(columns):
                return _to_float(numbers[index])
    return None


def guess_points(text: str) -> Optional[float]:
    """Reward points earned in this cycle, or None."""
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    lowered = [ln.lower() for ln in lines]

    table = _points_from_table(lines)
    if table is not None:
        return table

    for keyword in _POINTS_KEYWORDS:
        if keyword == "earned":
            continue  # bare "earned" only makes sense as a table header
        for i, low in enumerate(lowered):
            pos = low.find(keyword)
            if pos == -1 or any(bad in low for bad in _POINTS_EXCLUDE):
                continue

            after = lines[i][pos + len(keyword):]
            found = _POINTS.findall(after)
            if found:
                return _to_float(found[-1])

            # Value may have wrapped. Only trust a following line holding a
            # single number -- several numbers means we're looking at a table
            # row, where position matters and the first number is typically the
            # opening balance.
            for nxt in lines[i + 1: i + 3]:
                if any(b in nxt.lower() for b in _POINTS_EXCLUDE):
                    continue
                nums = _POINTS.findall(nxt)
                if len(nums) == 1:
                    return _to_float(nums[0])
                if nums:
                    break
    return None


def guess_period(text: str):
    """(period_start, period_end) as ISO strings; either may be None.

    Prefer an explicit range on a "statement period"-style line. Falling back to
    the min/max of every date on the page would happily pick up a card expiry or
    a payment due date, so we only fall back to a labelled statement date, which
    marks the end of the cycle.
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    lowered = [ln.lower() for ln in lines]

    for keyword in _PERIOD_KEYWORDS:
        for i, low in enumerate(lowered):
            pos = low.find(keyword)
            if pos == -1:
                continue
            # The range may run onto the next line.
            window = lines[i][pos:] + " " + (lines[i + 1] if i + 1 < len(lines) else "")
            found = find_dates(window)
            if len(found) >= 2:
                start, end = found[0], found[1]
                return (start, end) if start <= end else (end, start)

    for keyword in _END_KEYWORDS:
        for i, low in enumerate(lowered):
            pos = low.find(keyword)
            if pos == -1:
                continue
            found = find_dates(lines[i][pos:])
            if found:
                return (None, found[0])
    return (None, None)


def amounts_in(line: str) -> list:
    """Every money-shaped number on a line, left to right."""
    return [_to_float(m.group(1)) for m in _AMOUNT.finditer(line)]


def guess_total(text: str) -> Optional[float]:
    """Best guess at the statement total, or None.

    For each keyword in priority order, find where it occurs on a line and read
    the amount from the text *after* it, stopping at any following label such as
    "Minimum Amount Due" -- several banks put both figures on one row:

        Total Amount Due 9,876.54 Minimum Amount Due 500.00

    Within that segment take the right-most amount, since statement tables are
    right-aligned. If the segment holds no amount the value has wrapped, so
    check the next couple of lines.
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    lowered = [ln.lower() for ln in lines]

    for keyword in _TOTAL_KEYWORDS:
        for i, low in enumerate(lowered):
            pos = low.find(keyword)
            if pos == -1:
                continue
            # Reject "Minimum Amount Due" when matching the bare "amount due".
            # Only the words immediately before count -- an unrelated
            # "Previous Balance" earlier on the row must not disqualify it.
            if any(bad in low[max(0, pos - 12) : pos] for bad in _TOTAL_EXCLUDE):
                continue

            after = lines[i][pos + len(keyword) :]
            after_low = after.lower()
            cut = len(after)
            for bad in _TOTAL_EXCLUDE:
                j = after_low.find(bad)
                if j != -1:
                    cut = min(cut, j)

            on_line = amounts_in(after[:cut])
            if on_line:
                return on_line[-1]
            for nxt in lines[i + 1 : i + 3]:
                wrapped = amounts_in(nxt)
                if wrapped:
                    return wrapped[0]
    return None


# ── Transactions ─────────────────────────────────────────────────────────────
# A transaction row starts with its date. Some banks print a second (posting)
# date straight after; we keep the first, which is when you actually spent.
_TXN_LINE = re.compile(
    r"^\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]+\d{2,4})"
    r"\s+(?:(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\s+)?"   # optional posting date
    r"(.+)$"
)

# Money at the end of a transaction row, with an optional Cr/Dr marker.
# Unlike the summary amounts, a bare integer is allowed here: the row is
# already anchored to a leading date, and round UPI amounts ("UPI-ZOMATO 320")
# carry neither comma nor decimals. Capped at 6 digits so a trailing reference
# number can't be mistaken for a sum -- anything larger is comma-grouped anyway.
_TXN_AMOUNT = re.compile(
    r"(?:(?:₹|Rs\.?|INR)\s*)?"
    # The bare-integer branch needs (?<!\d) so it can't bite off the tail of a
    # long reference number: "BOOKING REF 1234567890123" must not read as
    # 890,123.
    r"(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{2}|(?<!\d)\d{1,6})"
    r"\s*(CR|DR|Cr|Dr)?\s*$"
)

# HDFC prefixes many rows with a transaction time; it's noise in the description.
_LEADING_TIME = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?\s+")

# Rows that begin with a date but aren't spending.
_TXN_SKIP = (
    "statement date", "payment due", "due date", "statement period",
    "billing", "opening balance", "closing balance", "total", "minimum",
)

_CREDIT_HINTS = ("payment received", "payment - thank", "refund", "reversal",
                 "cashback", "credit received", "autopay")


def _trailing_amount(rest: str):
    """(amount, marker, text_before) for a transaction row's amount column.

    Axis puts the cashback alongside the spend, so a row ends with TWO figures:

        WWW CULTURE CIRCLE COM,GURUGRAM CLOTH STORES 20,538.00 Dr 308.00 Cr

    Taking the last one books a Rs.20,538 purchase as Rs.308 -- and as a credit,
    because the cashback column is Cr. So peel marked (Dr/Cr) figures off the
    end and keep the LEFT-most, which is the amount column.

    A figure with no marker ends the scan: banks that print one bare amount
    (HDFC) are handled, while a description ending in digits ("...REF# 74154")
    can't be mistaken for another column.
    """
    found = []
    head = rest
    while True:
        m = _TXN_AMOUNT.search(head)
        if not m:
            break
        marker = (m.group(2) or "").lower()
        if not marker and found:
            break  # trailing digits inside the description, not a column
        found.append((_to_float(m.group(1)), marker))
        head = head[: m.start()]
        if not marker:
            break
    if not found:
        return None, "", rest
    amount, marker = found[-1]
    return amount, marker, head


def extract_transactions(text: str) -> list:
    """[{date, description, amount, credit}] for every row that looks like one.

    Deliberately conservative: a row must start with a date AND end with an
    amount. Statement PDFs are full of dated summary lines, so anything without
    both is skipped rather than guessed at.
    """
    out = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = _TXN_LINE.match(line)
        if not m:
            continue
        low = line.lower()
        if any(skip in low for skip in _TXN_SKIP):
            continue

        when = find_dates(m.group(1))
        if not when:
            continue

        rest = m.group(2).strip()
        amount, marker, head = _trailing_amount(rest)
        if amount is None:
            continue

        description = _LEADING_TIME.sub("", head.strip()).strip(" .-\t")
        if not description:
            continue

        # An explicit Dr/Cr is authoritative; the description hints are only a
        # fallback for banks that print no marker at all. Otherwise a row like
        # "REFUND PROCESSING FEE 100.00 Dr" would be booked as money in.
        if marker:
            credit = marker == "cr"
        else:
            credit = any(h in low for h in _CREDIT_HINTS)

        cleaned = " ".join(description.split())
        out.append({
            "date": when[0],
            "description": cleaned,
            # Labelled here rather than by the caller, so every consumer -- the
            # API, the diagnostic script, tests -- sees the same shape.
            "merchant": merchant_of(cleaned),
            "amount": amount,
            "credit": credit,
        })
    return out


# Descriptions are noisy ("AMAZON INDIA BANGALORE IN"), so map them onto a
# short merchant name for grouping and filtering.
_MERCHANTS = [
    "Amazon", "Flipkart", "Swiggy", "Zomato", "Myntra", "Uber", "Ola",
    "BookMyShow", "BigBasket", "Blinkit", "Zepto", "Nykaa", "Ajio",
    "Tata Neu", "Croma", "Reliance", "DMart", "IRCTC", "MakeMyTrip",
    "Cleartrip", "Goibibo", "Netflix", "Spotify", "Apple", "Google",
    "PhonePe", "Paytm", "Cult.fit", "Sony LIV", "Tata CLiQ", "Jio",
    "Airtel", "Starbucks", "Dominos", "Zudio", "Decathlon", "Lenskart",
]
_MERCHANT_LOOKUP = [(m.lower().replace(".", "").replace(" ", ""), m) for m in _MERCHANTS]


def merchant_of(description: str) -> str:
    """A short merchant label for a raw transaction description."""
    squashed = re.sub(r"[^a-z0-9]", "", (description or "").lower())
    for needle, label in _MERCHANT_LOOKUP:
        if needle in squashed:
            return label
    # Unknown: first couple of words, title-cased, which reads better than the
    # bank's all-caps blob.
    words = [w for w in re.split(r"\s+", description or "") if w][:2]
    return " ".join(w.capitalize() for w in words) or "Other"


def parse_statement(data: bytes, password: Optional[str]) -> dict:
    """Return {ok, guessed_total, dates[], text_preview} or {ok: False, error, needs_password}."""
    try:
        with pdfplumber.open(io.BytesIO(data), password=password or "") as pdf:
            text = "\n".join((page.extract_text() or "") for page in pdf.pages)
    except Exception as exc:  # noqa: BLE001 - surface any open/decrypt failure to the user
        msg = str(exc)
        # pdfminer raises PDFPasswordIncorrect with an EMPTY message, so
        # sniffing the text alone reports a bare "Could not read PDF:" and
        # never tells the user to try a password. Check the type as well.
        name = type(exc).__name__.lower()
        needs_pw = (
            "password" in name
            or "password" in msg.lower()
            or "encrypt" in msg.lower()
        )
        if needs_pw:
            error = (
                "That PDF password didn't work. Check it and try again."
                if password
                else "This statement is password protected — enter its password above."
            )
        else:
            error = f"Could not read PDF: {msg}" if msg else "Could not read this PDF."
        return {"ok": False, "error": error, "needs_password": needs_pw}

    if not text.strip():
        # A scanned / image-only statement extracts to nothing. Say so plainly,
        # rather than returning an empty draft that reads like a parser bug.
        return {
            "ok": True,
            "guessed_total": None,
            "guessed_points": None,
            "period_start": None,
            "period_end": None,
            "dates": [],
            "text_preview": "",
            "no_text": True,
        }

    period_start, period_end = guess_period(text)
    transactions = extract_transactions(text)

    return {
        "ok": True,
        "guessed_total": guess_total(text),
        "guessed_points": guess_points(text),
        # ISO, so the frontend's <input type="date"> can consume them directly.
        "period_start": period_start,
        "period_end": period_end,
        "transactions": transactions,
        "dates": find_dates(text)[:6],
        "text_preview": text[:2000],
    }
