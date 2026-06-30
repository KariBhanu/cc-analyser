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

    @property
    def google_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)


settings = Settings()
