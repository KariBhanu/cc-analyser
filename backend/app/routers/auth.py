"""Authentication: email/password signup + login, OTP verification, Google OAuth.

Session shape
-------------
`session["user"]`       set once fully logged in; the rest of the app reads
                        `user["email"]` as the data-ownership key (deps.py).
`session["pending_id"]` set during signup / after a login blocked on an
                        unverified email. It scopes the verify + resend
                        endpoints without putting a token in the URL.

Verification policy: a verified EMAIL is required to log in. Phone is collected
at signup and verified through the same machinery, but is not a login gate unless
REQUIRE_PHONE_VERIFICATION=true -- SMS is a console stub until DLT registration
is done, so gating on it would lock the account out. See services/sms.py.
"""
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from ..config import settings
from ..deps import store
from ..models import LoginIn, ResendOtpIn, SignupIn, VerifyOtpIn
from ..services import accounts, mailer, otp, passwords, sms

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


# ── helpers ──────────────────────────────────────────────────────────────────

def _pending_user(request: Request) -> dict:
    """The account currently allowed to verify a code, or 401.

    Falls back to the logged-in session user: once email is verified we log the
    user straight in (phone isn't a gate), and they must still be able to finish
    phone verification afterwards — from the verify screen or later from the app.
    """
    user_id = request.session.get("pending_id")
    record = accounts.find_by_id(store, user_id) if user_id else None
    if record is None:
        email = (request.session.get("user") or {}).get("email")
        record = accounts.find_by_email(store, email) if email else None
    if not record:
        raise HTTPException(401, "No signup in progress. Start again.")
    return record


def _send_code(record: dict, channel: str) -> dict:
    """Issue and deliver a code. Returns the per-channel status for the client."""
    destination = record["email"] if channel == otp.EMAIL else record.get("phone")
    if not destination:
        raise HTTPException(400, f"No {channel} on file for this account.")

    wait = otp.seconds_until_resend(store, record["id"], channel)
    if wait:
        raise HTTPException(429, f"Please wait {wait}s before requesting another code.")

    code = otp.issue(store, record["id"], channel, destination)
    delivered = (
        mailer.send_otp_email(destination, code) if channel == otp.EMAIL
        else sms.send_otp_sms(destination, code)
    )
    return {
        "channel": channel,
        "destination": _mask(destination, channel),
        # False means the code is only in the backend log -- the frontend shows a
        # hint so a developer isn't left waiting for a message that never arrives.
        "delivered": delivered,
        "expires_in": settings.otp_ttl_seconds,
        "resend_in": settings.otp_resend_seconds,
    }


def _mask(destination: str, channel: str) -> str:
    if channel == otp.PHONE:
        return f"••••••{destination[-4:]}" if len(destination) > 4 else destination
    name, _, domain = destination.partition("@")
    shown = name[:2] if len(name) > 2 else name[:1]
    return f"{shown}{'•' * max(2, len(name) - len(shown))}@{domain}"


def _verification_state(record: dict) -> dict:
    return {
        "email_verified": bool(record.get("email_verified")),
        "phone_verified": bool(record.get("phone_verified")),
        "phone_required": settings.require_phone_verification,
        "has_phone": bool(record.get("phone")),
    }


def _login(request: Request, record: dict) -> dict:
    request.session.pop("pending_id", None)
    request.session["user"] = accounts.public(record)
    return request.session["user"]


# ── discovery ────────────────────────────────────────────────────────────────

@router.get("/config")
async def auth_config():
    """Which login methods and delivery channels are available."""
    return {
        "google": settings.google_configured,
        "dev_login": settings.dev_login,
        "email_delivery": settings.smtp_configured,
        "sms_delivery": False,          # console stub; see services/sms.py
        "phone_required": settings.require_phone_verification,
        "password_min_length": passwords.MIN_LENGTH,
    }


# ── email + password ─────────────────────────────────────────────────────────

@router.post("/signup", status_code=201)
async def signup(body: SignupIn, request: Request):
    email = accounts.normalise_email(body.email)
    if not accounts.valid_email(email):
        raise HTTPException(422, "That doesn't look like a valid email address.")

    phone = accounts.normalise_phone(body.phone)
    if not phone:
        raise HTTPException(422, "Enter a 10-digit Indian mobile number.")

    existing = accounts.find_by_email(store, email)
    if existing:
        # An unverified account can be resumed rather than blocking the address
        # forever; a verified one is a genuine conflict.
        if existing.get("email_verified"):
            raise HTTPException(409, "An account with that email already exists. Log in instead.")
        request.session["pending_id"] = existing["id"]
        try:
            sent = _send_code(existing, otp.EMAIL)
        except HTTPException:
            # Still inside the resend window from the first attempt. Resuming is
            # more useful than a 429 here: send them to the verify screen with
            # the existing code still valid and a countdown on the resend button.
            sent = None
        return {
            "user": accounts.public(existing),
            "verification": _verification_state(existing),
            "sent": sent,
            "resend_in": otp.seconds_until_resend(store, existing["id"], otp.EMAIL),
            "resumed": True,
        }

    clash = accounts.find_by_phone(store, phone)
    if clash:
        raise HTTPException(409, "That mobile number is already registered.")

    record = accounts.create(
        store, name=body.name, email=email, phone=phone, password=body.password,
    )
    request.session["pending_id"] = record["id"]
    return {
        "user": accounts.public(record),
        "verification": _verification_state(record),
        "sent": _send_code(record, otp.EMAIL),
        "resumed": False,
    }


@router.post("/login")
async def login_password(body: LoginIn, request: Request):
    record = accounts.find_by_email(store, body.email)
    # Same message either way so the endpoint can't be used to enumerate emails.
    invalid = HTTPException(401, "Email or password is incorrect.")
    if not record or not record.get("password_hash"):
        raise invalid
    if not passwords.verify_password(body.password, record["password_hash"]):
        raise invalid

    if not record.get("email_verified"):
        request.session["pending_id"] = record["id"]
        raise HTTPException(403, "Verify your email address to finish signing in.")
    if settings.require_phone_verification and not record.get("phone_verified"):
        request.session["pending_id"] = record["id"]
        raise HTTPException(403, "Verify your mobile number to finish signing in.")

    return _login(request, record)


# ── OTP ──────────────────────────────────────────────────────────────────────

@router.get("/pending")
async def pending(request: Request):
    """What the verify screen needs on load / after a refresh."""
    record = _pending_user(request)
    return {
        "user": accounts.public(record),
        "verification": _verification_state(record),
        "resend_in": {
            channel: otp.seconds_until_resend(store, record["id"], channel)
            for channel in otp.CHANNELS
        },
    }


@router.post("/resend-otp")
async def resend_otp(body: ResendOtpIn, request: Request):
    record = _pending_user(request)
    return {"sent": _send_code(record, body.channel)}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpIn, request: Request):
    record = _pending_user(request)

    ok, error = otp.verify(store, record["id"], body.channel, body.code)
    if not ok:
        raise HTTPException(400, error)

    field = "email_verified" if body.channel == otp.EMAIL else "phone_verified"
    updated = accounts.update_flags(store, record["id"], {field: True}) or record

    # Email done -> immediately push a phone code so the flow continues without
    # another round trip. Phone done (or not required) -> log them in.
    if body.channel == otp.EMAIL and not updated.get("phone_verified") and updated.get("phone"):
        try:
            sent = _send_code(updated, otp.PHONE)
        except HTTPException:
            sent = None                        # throttled; the screen offers resend
        if settings.require_phone_verification:
            return {
                "verification": _verification_state(updated),
                "sent": sent,
                "user": accounts.public(updated),
                "logged_in": False,
            }
        return {
            "verification": _verification_state(updated),
            "sent": sent,
            "user": _login(request, updated),
            "logged_in": True,
        }

    return {
        "verification": _verification_state(updated),
        "sent": None,
        "user": _login(request, updated),
        "logged_in": True,
    }


# ── Google ───────────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login(request: Request):
    """Kick off the OAuth dance. Named /google so it can't be confused with the
    POST /login password endpoint; the callback URI registered in the Google
    Console is unchanged."""
    if not settings.google_configured:
        raise HTTPException(400, "Google sign-in is not configured. See backend/.env.")
    redirect_uri = f"{settings.backend_url}/api/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    info = token.get("userinfo") or {}
    email = accounts.normalise_email(info.get("email", ""))
    if not email:
        raise HTTPException(400, "Google did not return an email.")

    record = accounts.find_by_email(store, email)
    if record:
        # Google has already proven the address, so trust it and link the record
        # even if this account was originally created with a password.
        patch = {"email_verified": True}
        if info.get("picture"):
            patch["picture"] = info["picture"]
        if not record.get("name") and info.get("name"):
            patch["name"] = info["name"]
        record = accounts.update_flags(store, record["id"], patch) or record
    else:
        patch = {"picture": info["picture"]} if info.get("picture") else {}
        record = accounts.create(
            store, name=info.get("name") or email.split("@")[0], email=email,
            phone=None, password=None, provider="google", email_verified=True,
        )
        if patch:
            record = accounts.update_flags(store, record["id"], patch) or record

    _login(request, record)
    return RedirectResponse(settings.frontend_url)


# ── session ──────────────────────────────────────────────────────────────────

@router.post("/dev-login")
async def dev_login(request: Request):
    """Log in as a fixed local user without Google -- development only."""
    if not settings.dev_login:
        raise HTTPException(403, "Dev login is disabled.")
    email = "dev@example.com"
    record = accounts.find_by_email(store, email) or accounts.create(
        store, name="Dev User", email=email, phone=None, password=None,
        provider="dev", email_verified=True,
    )
    return _login(request, record)


@router.get("/me")
async def me(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(401, "Not authenticated")
    # Re-read so verification flags stay fresh if they changed since login.
    record = accounts.find_by_email(store, user.get("email", ""))
    return accounts.public(record) if record else user


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"ok": True}
