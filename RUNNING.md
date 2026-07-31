# ▶️ Running cc-analyser locally

Quickstart for getting the app up on your own machine. For what the app *does*
and why it's built this way, see [README.md](README.md).

You need **two terminals** — one for the backend, one for the frontend.

| | Command | URL |
|---|---|---|
| Backend (FastAPI) | `uvicorn app.main:app --reload` | http://localhost:8000 |
| Frontend (Vite) | `npm run dev` | http://localhost:5173 |

API docs (Swagger): http://localhost:8000/docs

---

## Prerequisites

- **Python 3.9+** (3.11+ recommended)
- **Node 18+**

---

## 1. Backend — terminal 1

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

On Windows the activate line is `.venv\Scripts\activate`. The `cp .env.example .env`
is first-time only — see [Configuration](#configuration).

> Commands in this file carry no trailing `#` comments on purpose. zsh does **not**
> treat `#` as a comment in interactive shells, so a pasted `pip install -r
> requirements.txt  # note` passes `#` to pip and fails with
> `Invalid requirement: '#'`.

Leave it running. You should see `Application startup complete.` and
`Uvicorn running on http://127.0.0.1:8000`.

## 2. Frontend — terminal 2

```bash
cd frontend

npm install
npm run dev
```

Open **http://localhost:5173**.

Vite proxies `/api` → `http://localhost:8000`, so the browser stays same-origin
and session cookies work. You don't need to open port 8000 yourself.

---

## 3. Logging in

Three options, easiest first.

### a. Dev login (no setup)

With `DEV_LOGIN=true` in `backend/.env`, the login page shows
**"Continue without Google (dev)"**. Signs you in as `dev@example.com`.

### b. Email signup with OTP

Sign up with an email + password. The verification code is delivered by email
**only if SMTP is configured**. If it isn't, the code is **printed to the
backend terminal** — copy it from there into the verify screen. So signup works
locally with no mail server at all.

### c. Google OAuth

Fill in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, then restart the backend.
Setup steps are in [README.md](README.md#google-oauth-setup-when-you-want-real-login).
The redirect URI must be `http://localhost:8000/api/auth/callback`.

---

## Configuration

`backend/.env` — copy from `.env.example`. Everything has a working default
except `APP_SECRET`.

| Key | Default | Notes |
|---|---|---|
| `APP_SECRET` | insecure placeholder | **Set a real one.** Signs sessions *and* encrypts stored statement passwords. |
| `DEV_LOGIN` | `true` | Exposes the no-Google login button. Set `false` in production. |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin + OAuth redirect target. Change it if you run Vite on another port. |
| `BACKEND_URL` | `http://localhost:8000` | |
| `GOOGLE_CLIENT_ID` / `_SECRET` | empty | Blank = Google button hidden. |
| `SMTP_*` | empty | Blank = OTP codes go to the backend log instead of email. |
| `REQUIRE_PHONE_VERIFICATION` | `false` | Email verification is always required; phone is opt-in. |
| `DATA_DIR` | `backend/data` | JSON "database", used only when `DATABASE_URL` is unset. |
| `DATABASE_URL` | empty | Postgres DSN. Set = Postgres, unset = JSON files. Use the **pooled** endpoint. |

Generate a secret:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> ⚠️ Keep `APP_SECRET` stable. Changing it invalidates every stored statement
> PDF password, and you'll have to re-enter them.

---

## Storage: JSON files or Postgres

The app talks only to `StorageInterface`, so the backend is a config switch:

- **`DATABASE_URL` unset** → JSON files in `backend/data/` (zero setup, single machine)
- **`DATABASE_URL` set** → Postgres (`app/storage/postgres_store.py`)

Confirm which one is live from the startup line:

```
INFO:     storage: postgres (ep-xxx.ap-southeast-1.aws.neon.tech)
INFO:     storage: json files (/path/to/backend/data)
```

Switching back to JSON is just commenting out `DATABASE_URL` and restarting.

### Moving existing JSON data into Postgres

```bash
cd backend
python scripts/migrate_json_to_postgres.py
python scripts/migrate_json_to_postgres.py --apply
```

The first run is a dry run and prints a plan. It's idempotent — records already
present (same collection + id) are skipped, so re-running after a partial
failure is safe. Your JSON files are left untouched as a fallback.

### Notes

Use the **pooled** connection string. Neon's has `-pooler` or `.c-N.` in the
hostname. Each request would otherwise open a direct connection and exhaust the
limit.

Data lives in one `records` table with a JSONB `data` column, keyed by
`(collection, id)`. It stays queryable — `data->>'total_spend'` works.

Free Postgres tiers generally are **not backed up**. Keep exporting.

---

## Stopping

`Ctrl-C` in each terminal. If a port is stuck:

```bash
lsof -ti:8000 | xargs kill
lsof -ti:5173 | xargs kill
```

First line frees the backend port, second the frontend (macOS / Linux).

---

## Troubleshooting

### `ModuleNotFoundError` / wrong Python after switching machines

A virtualenv is **not portable across operating systems** — it hardcodes paths
to the interpreter that built it. If the repo was last used in the Linux
devcontainer (or vice versa), rebuild it:

```bash
cd backend && rm -rf .venv && python3 -m venv .venv
source .venv/bin/activate && pip install -r requirements.txt
```

### `No matching distribution found for psycopg-binary`

Your Python is too old for the pinned version. macOS Command Line Tools ships
**Python 3.9**, which is end-of-life and caps you at `psycopg 3.2.x` — 3.3+
requires 3.10. Check with `python3 --version`.

The pins in `requirements.txt` are chosen to work on 3.9. If you still hit this,
upgrade Python rather than chasing pins:

```bash
brew install python@3.12
cd backend
rm -rf .venv
/opt/homebrew/bin/python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### `ModuleNotFoundError: No module named 'psycopg'`

`pip install -r requirements.txt` didn't actually run, or ran into the zsh `#`
trap above. Re-run it and check for errors before restarting uvicorn.

### Vite fails with a missing `esbuild` / `rollup` binary

Same portability problem — `node_modules` contains platform-native binaries:

```bash
cd frontend && rm -rf node_modules && npm install
```

Do **not** delete `package-lock.json`, despite what the rollup error message
suggests. The committed lockfile already contains every platform's optional
binaries; removing it just churns it for no benefit.

Note that `node_modules` and `.venv` can only be valid for one OS at a time. If
the repo directory is shared with a container (bind mount), installing on one
side breaks the other — pick one place to run the app.

### `npm install` warns "packages have install scripts not yet covered"

Newer npm defers postinstall scripts, and Vite won't start without esbuild's
binary:

```bash
npm approve-scripts esbuild
```

### `Error: ENOSPC: System limit for number of file watchers reached`

The OS ran out of inotify watchers (common in containers). Either raise the
limit:

```bash
sudo sysctl fs.inotify.max_user_watches=524288
```

…or switch Vite to polling by adding this to `vite.config.js` under `server`:

```js
watch: { usePolling: true, interval: 300 },
```

### `Port 5173 is already in use`

Another Vite is running — kill it (see **Stopping**), or start on a free port
with `npm run dev -- --port 5174`. If you change the frontend port, update
`FRONTEND_URL` in `backend/.env` to match, or CORS and the OAuth redirect will
break.

### Running inside the devcontainer: page never loads

The workspace-root `.devcontainer/devcontainer.json` (at `/workspaces/GW/`, not
in this repo) only forwards
`[1455, 8081, 8190, 8280, 8580, 8000]` — **5173 is not in that list**, so the
dev server is unreachable from the host even though it's serving fine inside
the container. Either:

- forward 5173 manually in the VS Code **Ports** panel, **or**
- run Vite on an already-forwarded port: `npm run dev -- --port 8081`, **or**
- add `5173` to `forwardPorts` and rebuild the container (the permanent fix).

### Styles look broken / everything is unstyled text

`index.html` pulls Tailwind and the Google Fonts from CDNs, so the UI needs
network access on first load. Offline, or behind a TLS-inspecting proxy whose
CA the browser doesn't trust, it renders as unstyled HTML.
