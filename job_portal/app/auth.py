"""Authentication manager with JWT token handling."""

import secrets
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
import jwt


class AuthManager:
    def __init__(self):
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    def hash_password(self, password: str) -> str:
        return self.pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return self.pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, user_id: str, role: str = "user", expires_delta: Optional[timedelta] = None) -> str:
        from .database import settings
        if expires_delta is None:
            expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode = {
            "sub": user_id,
            "role": role,
            "exp": datetime.utcnow() + expires_delta,
        }
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")

    def create_refresh_token(self, user_id: str, expires_delta: Optional[timedelta] = None) -> str:
        from .database import settings
        if expires_delta is None:
            expires_delta = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
        to_encode = {"sub": user_id, "exp": datetime.utcnow() + expires_delta}
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")

    def verify_token(self, token: str, token_type: str = "access") -> Optional[dict]:
        from .database import settings
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            return payload
        except jwt.PyJWTError:
            return None


auth_manager = AuthManager()