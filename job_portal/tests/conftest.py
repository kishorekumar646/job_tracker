"""
Author: Kishore Kumar
Shared pytest configuration.

- Points the app at a throwaway database for the whole run (never the real rca_auth.db).
- Patches out the RabbitMQ connect/close lifecycle so tests never try to
  open a real AMQP connection during app startup/shutdown.
- Keeps the Regression scheduler loop from starting with the app, and Single Run results
  and the startup claim cleanup out of the real database (``run_analyses``).
- Sets a deterministic RCA_SERVICE_API_KEY used by test_routers_rca.py.
"""
from __future__ import annotations

import asyncio
import os
import tempfile
from unittest.mock import AsyncMock, patch

import pytest

# Every test runs against a throwaway SQLite file — never the real rca_auth.db (tests used to write
# job rows into it and fight the running dev server for its write lock). Set before the app (and
# its engine) is imported; the environment wins over .env.
_TEST_DB_DIR = tempfile.mkdtemp(prefix="rca-tests-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(_TEST_DB_DIR, 'test.db')}"


@pytest.fixture(scope="session", autouse=True)
def _test_database():
    """Create every table in the throwaway database once (tests without the app lifespan need them)."""
    from app.core import db as core_db
    import app.auth.models  # noqa: F401 — register the models on Base

    async def _create():
        async with core_db.engine.begin() as conn:
            await conn.run_sync(core_db.Base.metadata.create_all)
        await core_db.engine.dispose()

    asyncio.run(_create())
    yield


@pytest.fixture(autouse=True)
def mock_mq_lifecycle():
    """Prevent real RabbitMQ connections in every test."""
    with (
        patch("app.services.mq_publisher.connect", new_callable=AsyncMock),
        patch("app.services.mq_publisher.close", new_callable=AsyncMock),
        patch("app.services.mq_publisher.publish_verdicts", new_callable=AsyncMock),
        patch("app.services.regression_scheduler.start"),  # no background schedule loop in tests
        # Single Run results are stored for batch reuse; keep tests out of the real database.
        patch("app.routers.rca._remember_quietly", new_callable=AsyncMock),
        patch("app.services.run_analysis.clear_stale_claims", new_callable=AsyncMock, return_value=0),
    ):
        yield

