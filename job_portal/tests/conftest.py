"""
Author: Kishore Kumar
Shared pytest setup: throwaway database/uploads, no scheduler, async HTTP client.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="job_portal_tests_")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{_TMP}/test.db")
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-test-secret-key-0123456789"
os.environ["AUTO_APPLY_INTERVAL_MINUTES"] = "0"

import httpx  # noqa: E402
from helpers import register  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.api.v1 import auth as auth_routes  # noqa: E402
from app.database import Base, async_engine  # noqa: E402
from app.main import app, init_db  # noqa: E402


@pytest_asyncio.fixture
async def client():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await init_db()
    auth_routes._attempts.clear()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def user(client):
    """A signed-up, activated, logged-in user (cookies live on ``client``)."""
    return (await register(client))[0]
