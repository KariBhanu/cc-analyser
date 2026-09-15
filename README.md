# 💳 SmartCred

A personal web app to track **credit card spend, rewards, and annual-fee waivers** —
built for **Indian credit cards**. You log in with Google, add your cards and their
terms, feed in statements (PDF upload or manual entry), and the dashboard shows where
you stand and which card to use where.

> **v1 status:** working foundation. All card data is **entered by you** — no scraping,
> no catalog, no auto-fetch yet. See [Roadmap](#roadmap).

---

## Features (v1)

1. **Google login** — sign in with your Gmail account (identity only).
2. **Dashboard** — total spend and total rewards (in ₹) per card and overall.
3. **Fee-waiver tracker** — "spend ₹X more this financial year to waive the ₹Y annual fee."
4. **Best card for a merchant** — pick a website (Amazon, Flipkart, Swiggy…) and see which
   of your cards gives the most *real* reward value (points × your conversion rate).
5. **Cards** — add each card with: annual fee, fee-waiver spend threshold, base reward rate,
   **one conversion rate (₹ per point)**, optional merchant bonuses, and the statement PDF
   password (stored **encrypted**).
6. **Statements** — upload a (password-protected) PDF for best-effort parsing into a draft
   you confirm, **or** type the figures manually.

---

## Tech stack & why

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **React + Vite** | Fast, simple SPA. |
| Backend | **Python + FastAPI** | The hard/growing work is **PDF statement parsing** and **transaction analysis** — Python (`pdfplumber`, future `pandas`) is strongest here, and scales cleanly to background workers later. |
| Storage | **JSON files** behind a `StorageInterface` | Zero setup for v1. The whole app talks to the interface, **not** to files — so moving to Postgres later is one new class, no rewrite. |
| Auth | **Google OAuth** (Authlib) | Best-supported login; identity scopes only in v1. |

```
React (Vite)  ──/api──▶  FastAPI  ──▶  JSON files (swap → Postgres in v2)
  dashboard                  ├─ rewards & fee-waiver engine (services/rewards.py)
  cards / upload             ├─ PDF parser (services/statements.py, pdfplumber)
                             └─ encrypted secrets (security.py — Fernet)
```

---

## Project layout

```
cc-analyser/
├─ backend/
│  ├─ app/
│  │  ├─ main.py            # FastAPI app + middleware
│  │  ├─ config.py          # env settings
│  │  ├─ deps.py            # storage singleton + auth guard
│  │  ├─ security.py        # encrypt/decrypt (statement passwords)
│  │  ├─ models.py          # pydantic schemas
│  │  ├─ storage/           # base.py (interface) + json_store.py
│  │  ├─ services/          # rewards.py, statements.py (PDF parsing)
│  │  └─ routers/           # auth, cards, statements, dashboard
│  ├─ data/                 # JSON "database" (gitignored)
│  ├─ requirements.txt
│  └─ .env.example
└─ frontend/
   ├─ src/ (App, api.js, pages/)
   └─ package.json
```

---

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Generate a real secret for `.env`:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`APP_SECRET` signs your login session **and** encrypts stored statement passwords —
keep it stable, or you'll have to re-enter passwords.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Logging in

- **Without Google (quickest):** leave `GOOGLE_CLIENT_ID`/`SECRET` blank and keep
  `DEV_LOGIN=true`. The login page shows **"Continue without Google (dev)."**
- **With Google:** follow the steps below, then the **"Sign in with Google"** button works.

---

## Google OAuth setup (when you want real login)

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name/email →
   **add yourself as a Test user** (keeps the app in *Testing* mode = no Google
   verification needed for personal use).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → *Web application*.
   - Authorized redirect URI: `http://localhost:8000/api/auth/callback`
4. Copy the **Client ID** and **Client secret** into `backend/.env`.
5. Restart the backend.

Scopes used: `openid email profile` only — **we do not read your email in v1.**

---

## Analysis: fetching statements from Gmail (deferred to v2)

You asked whether statements can be auto-pulled from Gmail (e.g. backfilling from January).
Findings:

**Easy ✅**
- **No historical limit.** The Gmail API can search the whole mailbox; a query like
  `from:(hdfc OR sbi OR icici) subject:statement after:2026/01/01` finds old statements
  just as easily as new ones. Backfilling from January is *not* the hard part.
- **No Google verification for personal use.** `gmail.readonly` is a restricted scope, but
  only matters if you *publish* the app. Kept in *Testing* mode with yourself as a test
  user, it works freely. (Caveat: test-mode refresh tokens expire every 7 days → weekly re-login.)

**Hard ⚠️ (the real blockers)**
1. **Password-protected PDFs.** Indian bank statements are encrypted. Gmail hands us the file
   fine, but we need the password to read it → we already store a per-card encrypted password.
2. **Format variance.** Every bank's email + PDF layout differs; each needs its own parser.
3. **Link-only statements.** Some banks email a "log in to view" link with no attachment —
   these **cannot** be auto-fetched; manual upload is the only option.

**Conclusion:** auto-*fetching* is feasible; auto-*parsing everything* reliably is not
guaranteed. v1 therefore ships **manual upload as the reliable backbone**; Gmail auto-fetch
(v2) will reuse the same parser, with manual upload as the permanent fallback for misses.

## Analysis: sourcing card terms by web scraping (not in v1)

Card terms live on bank sites + aggregators (CardExpert, BankBazaar, Paisabazaar). Automated
scraping is a **poor fit**: the data is unstructured/marketing-heavy, layouts change, many
sites have bot protection, and systematic scraping is a ToS gray area — all to maintain a
tiny, slow-changing dataset. **v1 decision: the user enters card terms (including the single
conversion rate) by hand.** A future "catalog helper" could assist, but is flagged fragile.

---

## How rewards are calculated

- **One conversion rate per card** — `rupee_per_point` (e.g. HDFC Millennia `1.0`; a 4-points-=-₹1
  card → `0.25`).
- Reward value = `points_earned × rupee_per_point`. If you don't enter points for a statement,
  it's estimated as `spend ÷ 100 × points_per_100`.
- **Best-card** ranks by `value_per_100 = points_per_100 × rupee_per_point` — comparing real ₹,
  not raw points.
- **Fee waiver** sums spend within the current **Indian financial year (Apr–Mar)** per card and
  compares to the card's threshold.

---

## Roadmap

**v2 (planned, model already friendly to it):**
- 📧 **Gmail auto-fetch** of statements (incl. January backfill) → same parser.
- 🏦 Per-bank statement parsers (HDFC, SBI, ICICI, Axis…).
- 🗄️ Swap JSON storage → **Postgres** (implement one new `StorageInterface` class).

**Later / long scope:**
- 🔍 **Auto-detect which cards you hold** by scanning Gmail for bank emails.
- 📚 Card-catalog helper (curated; scraping only if it proves reliable).
- 📊 Transaction-level categorization & spend analytics.

---

## Security notes

- Statement PDF passwords are encrypted at rest (Fernet, key derived from `APP_SECRET`).
- `backend/data/*.json` and `.env` are gitignored — **never commit real statements or secrets.**
- v1 is built for **single-user local use**. Harden (HTTPS, secure cookies, real DB,
  per-user isolation review) before any public deployment.