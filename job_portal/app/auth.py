"""
Author: Kishore Kumar
JWT and TOTP helpers.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

import jwt
import base64
import io

import pyotp
import qrcode

from .database import settings


class AuthManager:
    @staticmethod
    def new_totp_secret() -> str:
        return pyotp.random_base32()

    @staticmethod
    def provisioning_uri(email: str, secret: str) -> str:
        return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="JobPilot")

    @staticmethod
    def qr_data_uri(uri: str) -> str:
        buf = io.BytesIO()
        qrcode.make(uri).save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    @staticmethod
    def verify_totp(secret: Optional[str], otp: str) -> bool:
        if not secret:
            return False
        try:
            return pyotp.TOTP(secret).verify(otp, valid_window=1)
        except Exception:
            return False

    def _encode(self, user_id: int, token_type: str, expires: timedelta, role: str = "user") -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user_id),
            "role": role,
            "type": token_type,
            "jti": uuid.uuid4().hex,
            "iat": now,
            "exp": now + expires,
        }
        return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def create_access_token(self, user_id: int, role: str = "user") -> str:
        return self._encode(user_id, "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), role)

    def create_refresh_token(self, user_id: int) -> str:
        return self._encode(user_id, "refresh", timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES))

    def verify_token(self, token: str, token_type: str = "access") -> Optional[dict]:
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        except jwt.PyJWTError:
            return None
        if payload.get("type") != token_type:
            return None
        return payload


auth_manager = AuthManager()
