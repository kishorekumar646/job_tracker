"""Authentication utilities with TOTP support."""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import pyotp
import base64
import qrcode
import io

from .database import Settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthManager:
    """Authentication manager with JWT and TOTP support."""

    def __init__(self):
        self.settings = Settings()

    def hash_password(self, password: str) -> str:
        """Hash a password using bcrypt."""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, subject: str, role: str = "user") -> str:
        """Create a JWT access token."""
        expire = datetime.utcnow() + timedelta(
            minutes=self.settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        to_encode = {
            "sub": subject,
            "role": role,
            "exp": expire,
            "type": "access",
        }
        return jwt.encode(to_encode, self.settings.SECRET_KEY, algorithm=self.settings.ALGORITHM)

    def create_refresh_token(self, subject: str) -> str:
        """Create a JWT refresh token."""
        expire = datetime.utcnow() + timedelta(
            minutes=self.settings.REFRESH_TOKEN_EXPIRE_MINUTES
        )
        to_encode = {
            "sub": subject,
            "exp": expire,
            "type": "refresh",
        }
        return jwt.encode(to_encode, self.settings.SECRET_KEY, algorithm=self.settings.ALGORITHM)

    def verify_token(self, token: str, token_type: str = "access") -> Optional[dict]:
        """Verify and decode a JWT token."""
        try:
            payload = jwt.decode(
                token,
                self.settings.SECRET_KEY,
                algorithms=[self.settings.ALGORITHM],
            )
            if payload.get("type") != token_type:
                return None
            return payload
        except JWTError:
            return None

    def generate_totp_secret(self) -> str:
        """Generate a new TOTP secret."""
        return pyotp.random_base32()

    def generate_totp_uri(self, email: str, secret: str) -> str:
        """Generate TOTP URI for QR code."""
        return pyotp.totp.TOTP(secret).provisioning_uri(
            name=email,
            issuer_name="Job Tracker",
        )

    def verify_totp(self, secret: str, code: str) -> bool:
        """Verify a TOTP code."""
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)

    def generate_qr_code(self, uri: str) -> str:
        """Generate QR code as base64 string."""
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")

        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        img_bytes = buffer.getvalue()

        return f"data:image/png;base64,{base64.b64encode(img_bytes).decode()}"


auth_manager = AuthManager()