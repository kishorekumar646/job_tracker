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
from app.models import UserProfile
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


async def test_schema_upgrade_handles_existing_rows(client, user):
    async with async_engine.begin() as conn:
        await conn.execute(text("ALTER TABLE users DROP COLUMN email_verified"))
        await conn.execute(text("ALTER TABLE users DROP COLUMN avatar"))
        await conn.execute(text("ALTER TABLE users DROP COLUMN guide_views"))
        await conn.execute(text("ALTER TABLE user_profiles DROP COLUMN resume_data"))
        await conn.run_sync(upgrade_columns)
        await conn.run_sync(upgrade_columns)
        assert not await conn.scalar(text("SELECT email_verified FROM users LIMIT 1"))
        assert await conn.scalar(text("SELECT avatar FROM users LIMIT 1")) is None
        assert await conn.scalar(text("SELECT guide_views FROM users LIMIT 1")) == 0
        assert await conn.scalar(text("SELECT resume_data FROM user_profiles LIMIT 1")) is None


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
