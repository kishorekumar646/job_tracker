"""TOTP authentication utilities."""

import secrets
import time
from typing import Optional
import hmac
import hashlib
import base64

try:
    import pyotp
    TOTP_AVAILABLE = True
except ImportError:
    TOTP_AVAILABLE = False


def generate_totp_secret() -> str:
    """Generate a random TOTP secret (base32-encoded for pyotp compatibility)."""
    return pyotp.random_base32()


def generate_qr_code_data(email: str, secret: str, issuer: str = "JobPortal") -> str:
    """Generate TOTP QR code data URI for provisioning."""
    if not TOTP_AVAILABLE:
        return ""
    try:
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name=email, issuer_name=issuer)
        return f"otpauth://totp/{issuer}:{email}?secret={secret}&issuer={issuer}"
    except Exception:
        return ""


def verify_totp(secret: str, otp: str, window: int = 2) -> bool:
    """Verify a TOTP code."""
    if not TOTP_AVAILABLE:
        return False
    try:
        totp = pyotp.TOTP(secret)
        return totp.verify(otp, valid_window=window)
    except Exception:
        return False


def generate_otp() -> str:
    """Generate a 6-digit OTP for testing/demo purposes."""
    return f"{secrets.randbelow(1000000):06d}"