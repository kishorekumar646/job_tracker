"""
Author: Kishore Kumar
Job platform connections, mounted at ``/api/v1/connections``.

    GET    /connections             every supported platform + link status
    PUT    /connections/{platform}  link an account (handle and/or profile URL)
    DELETE /connections/{platform}  unlink
"""

import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db
from ...deps import get_current_user
from ...models import PLATFORMS, SocialAccount, User
from ...schemas import ConnectionOut, ConnectRequest

router = APIRouter(prefix="/connections", tags=["connections"])

PLATFORM_INFO = {
    "linkedin": ("LinkedIn", "linkedin.com", "Easy Apply roles and recruiter outreach"),
    "naukri": ("Naukri", "naukri.com", "India's largest job board"),
    "indeed": ("Indeed", "indeed.com", "Millions of listings worldwide"),
    "glassdoor": ("Glassdoor", "glassdoor.com", "Jobs with company reviews and salaries"),
    "foundit": ("Foundit", "foundit.in", "Formerly Monster India"),
    "instahyre": ("Instahyre", "instahyre.com", "Curated tech and startup roles"),
}
_HANDLE_RE = re.compile(r"^[\w.@+\-]{2,120}$")


def _out(platform: str, account: SocialAccount | None) -> ConnectionOut:
    label, _, desc = PLATFORM_INFO[platform]
    return ConnectionOut(
        platform=platform, label=label, description=desc, connected=account is not None,
        handle=account.handle if account else None,
        profile_url=account.profile_url if account else None,
        connected_at=account.connected_at if account else None,
    )


def _check_platform(platform: str) -> str:
    platform = platform.lower()
    if platform not in PLATFORMS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unsupported platform '{platform}'")
    return platform


@router.get("", response_model=list[ConnectionOut])
async def list_connections(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    accounts = {
        a.platform: a
        for a in (await db.scalars(select(SocialAccount).where(SocialAccount.user_id == user.id))).all()
    }
    return [_out(p, accounts.get(p)) for p in PLATFORMS]


@router.put("/{platform}", response_model=ConnectionOut)
async def connect_platform(
    platform: str,
    body: ConnectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    platform = _check_platform(platform)
    if not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Verify your email in Settings → Profile before connecting accounts")
    handle = (body.handle or "").strip() or None
    url = (body.profile_url or "").strip() or None
    if not handle and not url:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter your profile URL or username/email")

    if url:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        domain = PLATFORM_INFO[platform][1]
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in ("http", "https") or not (host == domain or host.endswith("." + domain)):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"Profile URL must be on {domain}"
            )
        url = parsed.geturl()
    if handle and not _HANDLE_RE.match(handle):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Username/email contains invalid characters")

    account = await db.scalar(
        select(SocialAccount).where(SocialAccount.user_id == user.id, SocialAccount.platform == platform)
    )
    if account:
        account.handle, account.profile_url = handle, url
    else:
        account = SocialAccount(user_id=user.id, platform=platform, handle=handle, profile_url=url)
        db.add(account)
    await db.commit()
    await db.refresh(account)
    return _out(platform, account)


@router.delete("/{platform}", response_model=ConnectionOut)
async def disconnect_platform(
    platform: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    platform = _check_platform(platform)
    account = await db.scalar(
        select(SocialAccount).where(SocialAccount.user_id == user.id, SocialAccount.platform == platform)
    )
    if account:
        await db.delete(account)
        await db.commit()
    return _out(platform, None)
