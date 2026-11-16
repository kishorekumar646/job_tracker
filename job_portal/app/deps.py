"""
Author: Kishore Kumar
Shared FastAPI dependencies.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import auth_manager
from .database import get_async_db
from .models import User


async def get_current_user(
    access_token: Optional[str] = Cookie(None),
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_async_db),
) -> User:
    token = access_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    payload = auth_manager.verify_token(token, "access")
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")

    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    now = datetime.utcnow()
    if not user.last_seen or now - user.last_seen > timedelta(seconds=60):
        user.last_seen = now
        await db.commit()
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
