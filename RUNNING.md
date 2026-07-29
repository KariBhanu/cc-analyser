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
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # first time only — see "Configuration" below
uvicorn app.main:app --reload
```

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
| `DATA_DIR` | `backend/data` | JSON "database". |

Generate a secret:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> ⚠️ Keep `APP_SECRET` stable. Changing it invalidates every stored statement
> PDF password, and you'll have to re-enter them.

---

## Stopping

`Ctrl-C` in each terminal. If a port is stuck:

```bash
# macOS / Linux
lsof -ti:8000 | xargs kill        # backend
lsof -ti:5173 | xargs kill        # frontend
```

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

### Vite fails with a missing `esbuild` / `rollup` binary

Same portability problem — `node_modules` contains platform-native binaries:

```bash
cd frontend && rm -rf node_modules && npm install
```

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
