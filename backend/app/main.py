"""FastAPI entrypoint. Run: uvicorn app.main:app --reload (from backend/)."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .routers import assistant, auth, cards, catalog, dashboard, statements

app = FastAPI(title="SmartCred", version="0.1.0")

# Session cookie holds the logged-in user. Signed with APP_SECRET.
app.add_middleware(SessionMiddleware, secret_key=settings.app_secret, same_site="lax")

# Frontend (Vite dev server) runs on a different origin; allow it with cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(cards.router)
app.include_router(catalog.router)
app.include_router(statements.router)
app.include_router(dashboard.router)
app.include_router(assistant.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "google_configured": settings.google_configured}
