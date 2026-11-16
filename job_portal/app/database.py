"""Author: Kishore Kumar. Database configuration with async SQLAlchemy."""

from pathlib import Path
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.engine import URL, make_url
from pydantic_settings import BaseSettings
from pydantic import Field, model_validator


_BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    DATABASE_URL: str = f"sqlite+aiosqlite:///{_BASE_DIR / 'job_tracker.db'}"
    UPLOAD_DIR: str = str(_BASE_DIR / "uploads")
    MAX_RESUME_MB: int = 5
    # Minutes between scheduled auto-apply sweeps; 0 disables the scheduler.
    AUTO_APPLY_INTERVAL_MINUTES: int = 30
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, gt=0)
    REFRESH_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24 * 7, gt=0)
    COOKIE_SECURE: bool = False
    FRONTEND_DIST: str = ""
    WEBAUTHN_ORIGIN: str = ""
    WEBAUTHN_RP_ID: str = ""
    RENDER_EXTERNAL_URL: str = ""

    # Auth settings from .env
    JWT_SECRET_KEY: str  # required: set in .env
    JWT_ALGORITHM: str = "HS256"
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, gt=0)
    REDIS_URL: str = "redis://localhost:6379/0"

    # HTTPS email works on Render Free; SMTP remains available for other hosts.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    BREVO_API_KEY: str = ""
    BREVO_SENDER_EMAIL: str = ""
    BREVO_SENDER_NAME: str = "JobPilot"
    # Optional: read bank credit-alert emails straight from a mailbox (Gmail app password) instead of a forwarder.
    IMAP_HOST: str = ""
    IMAP_PORT: int = 993
    IMAP_USER: str = ""
    IMAP_PASSWORD: str = ""
    IMAP_FROM: str = ""  # only read mail whose sender contains this, e.g. "sbi.co.in"
    IMAP_POLL_SECONDS: int = 20

    # Optional live job feed (https://developer.adzuna.com); without keys only sample/own jobs are shown.
    ADZUNA_APP_ID: str = ""
    ADZUNA_APP_KEY: str = ""
    ADZUNA_COUNTRY: str = "in"

    # UPI "scan to pay" billing. Payments are confirmed manually by an admin from the bank statement.
    UPI_ID: str = ""
    UPI_PAYEE_NAME: str = "JobPilot"
    PRO_PRICE_INR: int = 199
    PRO_DAYS: int = 30
    PAYMENT_WEBHOOK_SECRET: str = ""
    ORDER_MINUTES: int = 15
    # Optional bank transfer details shown on checkout next to the UPI QR.
    BANK_ACCOUNT_NAME: str = ""
    BANK_ACCOUNT_NUMBER: str = ""
    BANK_IFSC: str = ""
    BANK_NAME: str = ""
    INVOICE_SELLER_NAME: str = "JobPilot"
    INVOICE_SELLER_ADDRESS: str = ""
    FREE_TOTAL_APPLY_LIMIT: int = 5  # lifetime, per account
    PRO_DAILY_APPLY_LIMIT: int = 50

    model_config = {"env_file": str(_BASE_DIR / ".env"), "env_file_encoding": "utf-8", "extra": "ignore"}

    @model_validator(mode="after")
    def refresh_duration(self) -> "Settings":
        if "REFRESH_TOKEN_EXPIRE_MINUTES" not in self.model_fields_set:
            self.REFRESH_TOKEN_EXPIRE_MINUTES = self.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60
        return self


settings = Settings()


def database_url(raw: str) -> URL:
    url = make_url(raw)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    if url.drivername == "postgresql+psycopg" and "sslmode" not in url.query:
        url = url.update_query_dict({"sslmode": "require"})
    return url


_url = database_url(settings.DATABASE_URL)
async_engine = create_async_engine(
    _url,
    echo=False,
    pool_pre_ping=True,
    **({"connect_args": {"check_same_thread": False}} if _url.get_backend_name() == "sqlite"
       else {"pool_size": 3, "max_overflow": 2}),
)

async_session_factory = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session