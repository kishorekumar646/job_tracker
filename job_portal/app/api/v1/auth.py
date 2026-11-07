"""
Authentication routes.

Mounted at ``/api/v1/auth`` by ``app/main.py``.

Flow:
    POST /auth/signup   → register account, get QR URL
    GET  /auth/totp/qr  → download QR PNG for authenticator app
    POST /auth/activate  → verify first TOTP code, activate account
    POST /auth/login      → verify TOTP code, receive access + refresh tokens (HttpOnly cookies)
    POST /auth/refresh    → rotate tokens using a valid refresh token (cookie)
    POST /auth/logout     → revoke all sessions, clear cookies
"""
from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Form, Body, HTTPException, Request, Response, Cookie, Query, status
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db, Settings
from ...models import User
from ...schemas import UserCreate
from ...crud import (
    create_user, get_user_by_email, get_user_by_id,
    update_user_totp, activate_user
)
from ...auth import auth_manager
from ...totp import generate_totp_secret, verify_totp, TOTP_AVAILABLE

settings = Settings()

router = APIRouter(prefix="/auth", tags=["auth"])

# Rate limiter (10 req/min per IP)
_RATE_LIMIT = 10
_RATE_WINDOW = 60
_rate_counters: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))


def _check_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    count, window_start = _rate_counters[ip]
    now = time.monotonic()
    if now - window_start >= _RATE_WINDOW:
        _rate_counters[ip] = (1, now)
    else:
        count += 1
        _rate_counters[ip] = (count, window_start)
        if count > _RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests — please wait before trying again.",
            )


def _validate_email(email: str) -> str:
    email = email.strip().lower()
    if not email.endswith("@gmail.com"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only @gmail.com email addresses are allowed.")
    return email


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    email: Annotated[str, Form()],
    full_name: Annotated[Optional[str], Form()] = None,
    date_of_birth: Annotated[Optional[str], Form()] = None,
    db: AsyncSession = Depends(get_async_db),
):
    """Register a new user with TOTP-based authentication."""
    email = _validate_email(email)
    existing_user = await get_user_by_email(db, email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = await create_user(db, UserCreate(email=email, name=full_name, date_of_birth=date_of_birth))

    totp_secret = generate_totp_secret()
    otpauth_url = f"otpauth://totp/JobPortal:{email}?secret={totp_secret}&issuer=JobPortal"

    user = await update_user_totp(db, user.id, totp_secret, otpauth_url)

    import urllib.parse
    qr_code_data_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={urllib.parse.quote(otpauth_url)}"

    return {
        "message": "Account created! Please activate with your authenticator app.",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "qr_code": qr_code_data_url,
            "totp_secret": totp_secret,
        }
    }


@router.get("/totp/qr")
async def totp_qr(email: Annotated[str, Query()], db: AsyncSession = Depends(get_async_db)):
    """Get TOTP QR code as PNG image."""
    email = _validate_email(email)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found or TOTP not set")

    import qrcode
    import io
    uri = f"otpauth://totp/JobPortal:{email}?secret={user.totp_secret}&issuer=JobPortal"
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return FastAPIResponse(content=buf.getvalue(), media_type="image/png")


@router.post("/activate", response_model=dict)
async def activate(email: Annotated[str, Form()], otp: Annotated[str, Form()], db: AsyncSession = Depends(get_async_db)):
    """Activate account using TOTP code."""
    user = await get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.is_approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account already activated")

    if not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User has no TOTP secret set")

    if not verify_totp(user.totp_secret, otp):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    user = await activate_user(db, user.id)

    access_token = auth_manager.create_access_token(str(user.id), user.role)
    refresh_token = auth_manager.create_refresh_token(str(user.id))

    user.refresh_token = refresh_token
    await db.commit()

    return {
        "message": "Account activated successfully!",
        "access_token": access_token,
        "token_type": "bearer",
        "expires_at": int(datetime.utcnow().timestamp() * 1000) + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_admin": user.is_admin,
            "is_approved": user.is_approved,
        }
    }


@router.post("/login", response_model=dict)
async def login(email: Annotated[str, Form()], otp: Annotated[str, Form()], response: Response = None, db: AsyncSession = Depends(get_async_db)):
    """Login with email and TOTP code, set HTTP-only cookies."""
    user = await get_user_by_email(db, email)
    if not user or not user.is_approved:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials or account not activated")

    if not user.totp_secret or not verify_totp(user.totp_secret, otp):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    access_token = auth_manager.create_access_token(str(user.id), user.role)
    refresh_token = auth_manager.create_refresh_token(str(user.id))

    user.refresh_token = refresh_token
    await db.commit()

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_at": int(datetime.utcnow().timestamp() * 1000) + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_admin": user.is_admin,
            "is_approved": user.is_approved,
        }
    }


@router.post("/logout")
async def logout(response: Response):
    """Logout and clear cookies."""
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}


@router.post("/refresh")
async def refresh_token(
    refresh_token_cookie: Optional[str] = Cookie(None), response: Response = None, db: AsyncSession = Depends(get_async_db)
):
    """Refresh access token using refresh token from cookie."""
    if not refresh_token_cookie:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="No refresh token")

    payload = auth_manager.verify_token(refresh_token_cookie, token_type="refresh")
    if not payload:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = await get_user_by_id(db, int(payload.get("sub")))
    if not user:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="User not found")

    if user.refresh_token != refresh_token_cookie:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Token mismatch")

    new_access_token = auth_manager.create_access_token(str(user.id), user.role)

    if response:
        response.set_cookie(
            key="access_token",
            value=new_access_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "expires_at": int(datetime.utcnow().timestamp() * 1000) + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
    }


@router.get("/me", response_model=dict)
async def get_current_user(access_token: str = Cookie(None), db: AsyncSession = Depends(get_async_db)):
    """Get current user from token."""
    if not access_token:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = auth_manager.verify_token(access_token)
    if not payload:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await get_user_by_id(db, int(payload.get("sub")))
    if not user:
        raise HTTPException(status_code=HTTP_401_UNAUTHORIZED, detail="User not found")

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "full_name": user.name,
        "role": user.role,
        "is_admin": user.is_admin,
        "is_approved": user.is_approved,
        "date_of_birth": user.date_of_birth,
        "dob_update_count": 0,
        "avatar_url": None,
        "receive_announcements": True,
        "permissions": [],
    }