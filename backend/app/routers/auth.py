"""Authentication: Google OAuth (identity only) + a dev-login fallback."""
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

oauth = OAuth()
if settings.google_configured:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


@router.get("/config")
async def auth_config():
    """Tell the frontend which login methods are available."""
    return {"google": settings.google_configured, "dev_login": settings.dev_login}


@router.get("/login")
async def login(request: Request):
    if not settings.google_configured:
        raise HTTPException(400, "Google OAuth not configured. Use dev-login or set credentials.")
    redirect_uri = f"{settings.backend_url}/api/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    info = token.get("userinfo") or {}
    if not info.get("email"):
        raise HTTPException(400, "Google did not return an email.")
    request.session["user"] = {
        "email": info["email"],
        "name": info.get("name"),
        "picture": info.get("picture"),
    }
    return RedirectResponse(settings.frontend_url)


@router.post("/dev-login")
async def dev_login(request: Request):
    """Log in as a fixed local user without Google -- for development only."""
    if not settings.dev_login:
        raise HTTPException(403, "Dev login is disabled.")
    request.session["user"] = {"email": "dev@example.com", "name": "Dev User", "picture": None}
    return request.session["user"]


@router.get("/me")
async def me(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}
