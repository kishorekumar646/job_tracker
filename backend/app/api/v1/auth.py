"""Authentication routes with TOTP support."""

from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db, Settings
from ...models import User
from ...schemas import (
    UserCreate,
    UserResponse,
    Token,
    LoginRequest,
    TOTPSetup,
    TOTPVerify,
)
from ...auth import auth_manager
from ...crud import create_user, get_user_by_email, get_user_by_id

settings = Settings()

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_async_db),
):
    """Register a new user."""
    existing_user = await get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = await create_user(db, user_data)
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        is_admin=user.is_admin,
    )


@router.post("/login", response_model=dict)
async def login(
    login_data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_async_db),
):
    """Login with email and password, set HTTP-only cookie."""
    user = await get_user_by_email(db, login_data.email)
    if not user or not auth_manager.verify_password(
        login_data.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

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
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_admin": user.is_admin,
        },
    }


@router.post("/logout")
async def logout(response: Response):
    """Logout and clear cookies."""
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}


@router.post("/refresh")
async def refresh_token(
    refresh_token: str = Cookie(None),
    response: Response = None,
    db: AsyncSession = Depends(get_async_db),
):
    """Refresh access token using refresh token from cookie."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    payload = auth_manager.verify_token(refresh_token, "refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user = await get_user_by_email(db, payload.get("sub"))
    if not user or user.refresh_token != refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    access_token = auth_manager.create_access_token(str(user.id), user.role)

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(get_async_db),
):
    """Get current user from token."""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = auth_manager.verify_token(access_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = await get_user_by_id(db, int(payload.get("sub")))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        is_admin=user.is_admin,
    )


@router.get("/totp/setup", response_model=TOTPSetup)
async def setup_totp(db: AsyncSession = Depends(get_async_db)):
    """Generate TOTP secret and QR code for setup."""
    secret = auth_manager.generate_totp_secret()
    uri = auth_manager.generate_totp_uri("user@example.com", secret)
    qr_code = auth_manager.generate_qr_code(uri)

    return TOTPSetup(secret=secret, qr_code=qr_code)


@router.post("/totp/verify")
async def verify_totp(
    totp_data: TOTPVerify,
    db: AsyncSession = Depends(get_async_db),
):
    """Verify TOTP code and enable 2FA."""
    is_valid = auth_manager.verify_totp(totp_data.secret, totp_data.code)
    return {"success": is_valid, "message": "TOTP verified" if is_valid else "Invalid code"}