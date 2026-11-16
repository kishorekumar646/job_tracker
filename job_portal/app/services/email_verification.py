"""
Author: Kishore Kumar
Email verification codes: deliver via HTTPS (Brevo) or SMTP, with a development-only log fallback.
"""

import asyncio
import hashlib
import hmac
import logging
import secrets
import smtplib
import httpx
from datetime import datetime, timedelta
from email.message import EmailMessage

from ..database import settings

logger = logging.getLogger("job_portal")

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5


class EmailDeliveryError(RuntimeError):
    pass


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    return hmac.new(settings.JWT_SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def codes_match(stored: str, code: str) -> bool:
    return hmac.compare_digest(stored, hash_code(code))


def expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)


def _send_smtp(to: str, code: str) -> None:
    cfg = settings
    msg = EmailMessage()
    msg["Subject"] = "Your JobPilot verification code"
    msg["From"] = cfg.SMTP_FROM or cfg.SMTP_USER
    msg["To"] = to
    msg.set_content(f"Your JobPilot email verification code is {code}. It expires in {CODE_TTL_MINUTES} minutes.")
    with smtplib.SMTP(cfg.SMTP_HOST, cfg.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if cfg.SMTP_USER:
            smtp.login(cfg.SMTP_USER, cfg.SMTP_PASSWORD)
        smtp.send_message(msg)


async def deliver(to: str, code: str) -> bool:
    """Returns False only for the local development log fallback."""
    if settings.BREVO_API_KEY:
        if not settings.BREVO_SENDER_EMAIL:
            raise EmailDeliveryError("BREVO_SENDER_EMAIL must be configured")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": settings.BREVO_API_KEY},
                    json={
                        "sender": {"email": settings.BREVO_SENDER_EMAIL, "name": settings.BREVO_SENDER_NAME},
                        "to": [{"email": to}],
                        "subject": "Your JobPilot verification code",
                        "textContent": f"Your JobPilot email verification code is {code}. It expires in {CODE_TTL_MINUTES} minutes.",
                    },
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise EmailDeliveryError("HTTPS email delivery failed") from exc
        return True
    if not settings.SMTP_HOST:
        if settings.COOKIE_SECURE:
            raise EmailDeliveryError("Email delivery is not configured; set an HTTPS email provider")
        logger.warning("SMTP not configured - verification code for %s is %s", to, code)
        return False
    try:
        await asyncio.to_thread(_send_smtp, to, code)
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailDeliveryError("SMTP email delivery failed") from exc
    return True
