# Author: Kishore Kumar
# Regression: ISSUE-001 — public /auth/totp/qr leaked the TOTP secret of activated accounts
# Found by /qa on 2026-11-01
# Report: .gstack/qa-reports/run-20261101T031943Z/qa-report-rca-service-api-2026-11-01.md
"""Tests for auth.service.totp_qr_png() access to activated accounts."""
from __future__ import annotations

import pyotp
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import service
from app.auth.models import User
from app.core.db import Base
from app.core.errors import AccountAlreadyExists

EMAIL = "qa-probe@infosys.com"


@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


async def _activated_user(db) -> str:
    await service.totp_setup(db, EMAIL)
    user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one()
    await service.totp_activate(db, EMAIL, pyotp.TOTP(user.totp_secret).now())
    return user.totp_secret


async def test_qr_available_before_activation(db):
    """Signup flow still gets its QR while the account is pending activation."""
    await service.totp_setup(db, EMAIL)
    png = await service.totp_qr_png(db, EMAIL)
    assert png.startswith(b"\x89PNG")


async def test_qr_refused_after_activation(db):
    """Once activated, the unauthenticated QR endpoint must not expose the secret."""
    await _activated_user(db)
    with pytest.raises(AccountAlreadyExists):
        await service.totp_qr_png(db, EMAIL)
