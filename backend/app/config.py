"""Central configuration, read from environment / .env."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

_BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings:
    app_secret: str = os.getenv("APP_SECRET", "dev-insecure-secret-change-me")
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    backend_url: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    data_dir: Path = Path(os.getenv("DATA_DIR", str(_BASE_DIR / "data")))
    dev_login: bool = os.getenv("DEV_LOGIN", "true").lower() == "true"

    # Postgres connection string. Unset => fall back to JSON files in data_dir.
    # Use the *pooled* endpoint: a connection per request exhausts the direct
    # endpoint's limit quickly.
    database_url: str = os.getenv("DATABASE_URL", "")

    # Email delivery for verification codes. Gmail: smtp.gmail.com:587 with an
    # App Password (see services/mailer.py). Unset => codes are logged, not sent.
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from: str = os.getenv("SMTP_FROM", "")
    smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

    # One-time codes.
    otp_length: int = int(os.getenv("OTP_LENGTH", "6"))
    otp_ttl_seconds: int = int(os.getenv("OTP_TTL_SECONDS", "600"))        # 10 minutes
    otp_max_attempts: int = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
    otp_resend_seconds: int = int(os.getenv("OTP_RESEND_SECONDS", "60"))

    # Email verification always gates login. Phone verification is collected at
    # signup but optional to finish, because SMS is a console stub until DLT
    # registration is done -- flip this to true once a provider is live.
    require_phone_verification: bool = os.getenv("REQUIRE_PHONE_VERIFICATION", "false").lower() == "true"

    @property
    def google_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)


settings = Settings()
