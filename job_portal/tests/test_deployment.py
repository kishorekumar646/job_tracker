"""
Author: Kishore Kumar
Deployment regressions for PostgreSQL, persistent resumes, email and same-origin hosting.
"""

import json

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import select, text

from app.database import async_engine, async_session_factory, database_url, settings
from app.main import upgrade_columns
from app.models import AutoApplyRun, AutoApplyRunJob, UserProfile
from app.services import email_verification as ev
from app.services.frontend import FrontendFiles
from helpers import register


@pytest.mark.parametrize("prefix", ["postgres://", "postgresql://", "postgresql+psycopg://"])
def test_postgres_connection_url(prefix):
    url = database_url(prefix + "postgres.project:p%40ss@pool.example:5432/postgres")
    assert url.drivername == "postgresql+psycopg" and url.password == "p@ss"
    assert url.query["sslmode"] == "require"
    local = database_url(prefix + "user@/test?sslmode=disable")
    assert local.query["sslmode"] == "disable"


async def test_disabled_scheduler_does_not_start(monkeypatch):
    from unittest.mock import AsyncMock
    from app import main

    scheduler = AsyncMock()
    monkeypatch.setattr(main, "init_db", AsyncMock())
    monkeypatch.setattr(main, "_scheduler", scheduler)
    monkeypatch.setattr(settings, "AUTO_APPLY_INTERVAL_MINUTES", 0)
    monkeypatch.setattr(settings, "IMAP_HOST", "")
    instance = FastAPI()
    async with main.lifespan(instance):
        scheduler.assert_not_called()
        assert instance.state.auto_apply_next_check_at is None
        assert instance.state.auto_apply_sweep_running is False


@pytest.mark.parametrize("fail_first", [False, True])
async def test_scheduler_reports_real_check_timing(client, user, monkeypatch, caplog, fail_first):
    import asyncio
    from contextlib import suppress
    from datetime import datetime, timedelta, timezone
    from types import SimpleNamespace
    from unittest.mock import Mock
    from app import main

    started = datetime(2030, 1, 1, 12, tzinfo=timezone.utc)
    finished = started + timedelta(minutes=7)
    clock = Mock()
    clock.now.side_effect = [started, finished]
    monkeypatch.setattr(main, "datetime", clock)
    monkeypatch.setattr(settings, "AUTO_APPLY_INTERVAL_MINUTES", 5)
    monkeypatch.setattr(main.app.state, "auto_apply_next_check_at", None, raising=False)
    monkeypatch.setattr(main.app.state, "auto_apply_sweep_running", False, raising=False)
    sleep_calls = asyncio.Queue()
    release_sleep = asyncio.Event()
    second_sweep = asyncio.Event()
    sweeps = []

    async def sleep(seconds):
        sleep_calls.put_nowait(seconds)
        await release_sleep.wait()
        release_sleep.clear()

    async def sweep():
        sweeps.append((main.app.state.auto_apply_next_check_at, main.app.state.auto_apply_sweep_running))
        if len(sweeps) == 1:
            if fail_first:
                raise RuntimeError("test scheduled sweep failure")
            return 3
        second_sweep.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(main, "asyncio", SimpleNamespace(sleep=sleep))
    monkeypatch.setattr(main, "sweep_all_users", sweep)
    task = asyncio.create_task(main._scheduler(main.app, 5))
    try:
        assert await asyncio.wait_for(sleep_calls.get(), 2) == 300
        state = (await client.get("/api/v1/auto-apply/status")).json()
        assert state["schedule_interval_minutes"] == 5
        assert state["next_scheduled_at"] == (started + timedelta(minutes=5)).isoformat()
        assert state["scheduled_sweep_running"] is False and state["enabled"] is False

        release_sleep.set()
        assert await asyncio.wait_for(sleep_calls.get(), 2) == 300
        assert sweeps == [(None, True)]
        state = (await client.get("/api/v1/auto-apply/status")).json()
        assert state["next_scheduled_at"] == (finished + timedelta(minutes=5)).isoformat()
        assert state["scheduled_sweep_running"] is False
        if fail_first:
            assert "scheduled auto-apply sweep failed" in caplog.text

        release_sleep.set()
        await asyncio.wait_for(second_sweep.wait(), 2)
        state = (await client.get("/api/v1/auto-apply/status")).json()
        assert state["next_scheduled_at"] is None and state["scheduled_sweep_running"] is True
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    state = (await client.get("/api/v1/auto-apply/status")).json()
    assert state["next_scheduled_at"] is None and state["scheduled_sweep_running"] is False


async def test_schema_upgrade_handles_existing_rows(client, user):
    async with async_session_factory() as db:
        legacy = AutoApplyRun(user_id=user["id"], applied=2)
        db.add(legacy)
        await db.commit()
        run_id = legacy.id
    async with async_engine.begin() as conn:
        await conn.execute(text("ALTER TABLE users DROP COLUMN email_verified"))
        await conn.execute(text("ALTER TABLE users DROP COLUMN avatar"))
        await conn.execute(text("ALTER TABLE users DROP COLUMN guide_views"))
        await conn.execute(text("ALTER TABLE users DROP COLUMN pro_welcome_pending"))
        await conn.execute(text("ALTER TABLE auto_apply_runs DROP COLUMN details_recorded"))
        await conn.execute(text("ALTER TABLE user_profiles DROP COLUMN resume_data"))
        await conn.run_sync(upgrade_columns)
        await conn.run_sync(upgrade_columns)
        assert not await conn.scalar(text("SELECT email_verified FROM users LIMIT 1"))
        assert await conn.scalar(text("SELECT avatar FROM users LIMIT 1")) is None
        assert await conn.scalar(text("SELECT guide_views FROM users LIMIT 1")) == 0
        assert not await conn.scalar(text("SELECT pro_welcome_pending FROM users LIMIT 1"))
        assert not await conn.scalar(text("SELECT details_recorded FROM auto_apply_runs LIMIT 1"))
        assert await conn.scalar(text("SELECT resume_data FROM user_profiles LIMIT 1")) is None
    legacy = (await client.get(f"/api/v1/auto-apply/runs/{run_id}")).json()
    assert legacy["applied"] == 2 and legacy["details_recorded"] is False and legacy["jobs"] == []


async def test_run_application_details_upgrade_preserves_older_snapshots(client, user):
    async with async_session_factory() as db:
        run = AutoApplyRun(user_id=user["id"], applied=1, jobs=[AutoApplyRunJob(
            title="Older role", company="Older company", source="linkedin",
            external_link="https://example.test/older", match_score=80, outcome="applied",
        )])
        db.add(run)
        await db.commit()
        run_id = run.id
    async with async_engine.begin() as conn:
        await conn.execute(text("ALTER TABLE applications DROP COLUMN auto_apply_run_job_id"))
        for column in ("application_id", "applied_at", "job_details"):
            await conn.execute(text(f"ALTER TABLE auto_apply_run_jobs DROP COLUMN {column}"))
        await conn.run_sync(upgrade_columns)
        await conn.run_sync(upgrade_columns)
        assert await conn.scalar(text("SELECT auto_apply_run_job_id FROM applications LIMIT 1")) is None
    response = await client.get(f"/api/v1/auto-apply/runs/{run_id}")
    assert response.status_code == 200 and response.json()["details_recorded"] is True
    snapshot = response.json()["jobs"][0]
    assert snapshot["title"] == "Older role" and snapshot["company"] == "Older company"
    assert snapshot["application_id"] is None and snapshot["applied_at"] is None
    assert snapshot["job_details"] is None and snapshot["application"] is None


async def test_resume_survives_without_upload_directory(client, user, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path / "not-created"))
    content = b"Skills: Python, FastAPI, PostgreSQL"
    response = await client.post("/api/v1/profile/resume", files={"file": ("resume.txt", content, "text/plain")})
    assert response.status_code == 200 and not (tmp_path / "not-created").exists()
    async with async_session_factory() as db:
        assert await db.scalar(select(UserProfile.resume_data).where(UserProfile.user_id == user["id"])) == content
    response = await client.get("/api/v1/profile/resume")
    assert response.content == content and response.headers["cache-control"] == "no-store"
    assert (await client.delete("/api/v1/profile/resume")).status_code == 200
    async with async_session_factory() as db:
        assert await db.scalar(select(UserProfile.resume_data).where(UserProfile.user_id == user["id"])) is None


async def test_legacy_resume_download(client, user, tmp_path):
    path = tmp_path / "old.txt"
    path.write_bytes(b"Python legacy resume")
    async with async_session_factory() as db:
        profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user["id"]))
        profile.resume_path = str(path)
        profile.resume_filename = "old.txt"
        await db.commit()
    assert (await client.get("/api/v1/profile/resume")).content == path.read_bytes()
    assert (await client.delete("/api/v1/profile/resume")).status_code == 200
    assert not path.exists()


@pytest.mark.parametrize("provider_status", [201, 503])
async def test_verification_email_over_https(client, monkeypatch, caplog, provider_status):
    await register(client, verified=False)
    monkeypatch.setattr(settings, "BREVO_API_KEY", "test-email-api-key")
    monkeypatch.setattr(settings, "BREVO_SENDER_EMAIL", "sender@example.com")
    monkeypatch.setattr(settings, "COOKIE_SECURE", True)
    monkeypatch.setattr(ev, "new_code", lambda: "123456")
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(provider_status, json={"messageId": "test"})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(ev.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(handle), **kwargs))
    result = await client.post("/api/v1/auth/email/send")
    assert len(requests) == 1 and str(requests[0].url) == "https://api.brevo.com/v3/smtp/email"
    assert requests[0].headers["api-key"] == "test-email-api-key"
    assert json.loads(requests[0].content)["to"] == [{"email": "asha@gmail.com"}]
    assert "123456" not in caplog.text
    if provider_status == 201:
        assert result.status_code == 200 and result.json()["delivered"]
        assert (await client.post("/api/v1/auth/email/verify", json={"code": "123456"})).status_code == 200
    else:
        assert result.status_code == 502


async def test_production_does_not_log_verification_codes(client, monkeypatch, caplog):
    await register(client, verified=False)
    monkeypatch.setattr(settings, "BREVO_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "COOKIE_SECURE", True)
    monkeypatch.setattr(ev, "new_code", lambda: "654321")
    assert (await client.post("/api/v1/auth/email/send")).status_code == 502
    assert "654321" not in caplog.text


async def test_frontend_serving_and_api_fallback(tmp_path):
    (tmp_path / "index.html").write_text("<html>JobPilot SPA</html>")
    (tmp_path / "sw.js").write_text("self.addEventListener('fetch', () => {})")
    (tmp_path / "manifest.json").write_text('{"name":"JobPilot"}')
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-123.js").write_text("console.log('app')")
    app = FastAPI()
    app.mount("/", FrontendFiles(directory=str(tmp_path), html=True))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        for path in ("/", "/dashboard", "/admin"):
            result = await client.get(path)
            assert result.status_code == 200 and "JobPilot SPA" in result.text
            assert result.headers["cache-control"] == "no-cache"
        for path in ("/api/v1/missing", "/assets/missing.js", "/missing.png"):
            result = await client.get(path)
            assert result.status_code == 404 and "JobPilot SPA" not in result.text
        for path in ("/sw.js", "/manifest.json"):
            assert (await client.get(path)).headers["cache-control"] == "no-cache"
        assert "immutable" in (await client.get("/assets/app-123.js")).headers["cache-control"]
        assert (await client.head("/dashboard")).status_code == 200


@pytest.mark.skipif(async_engine.dialect.name != "postgresql", reason="PostgreSQL RLS only")
async def test_postgres_denies_browser_role_access(client, user):
    async with async_engine.begin() as conn:
        assert await conn.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid = 'users'::regclass"))
        if not await conn.scalar(text("SELECT 1 FROM pg_roles WHERE rolname = 'jobpilot_anon_test'")):
            await conn.execute(text("CREATE ROLE jobpilot_anon_test NOLOGIN"))
        await conn.execute(text("GRANT USAGE ON SCHEMA public TO jobpilot_anon_test"))
        await conn.execute(text("GRANT SELECT ON users TO jobpilot_anon_test"))
        assert await conn.scalar(text("SELECT count(*) FROM users")) == 1
        await conn.execute(text("SET LOCAL ROLE jobpilot_anon_test"))
        assert await conn.scalar(text("SELECT count(*) FROM users")) == 0
