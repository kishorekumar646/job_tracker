"""
Author: Kishore Kumar
Smoke and behaviour tests for every API group.
"""

import io
import base64

import pyotp
import pytest
from PIL import Image

from helpers import register

API = "/api/v1"
SIGNUP = {"full_name": "Ravi Shankar", "date_of_birth": "1998-01-01", "email": "ravi@gmail.com"}


# ---------- auth ----------

async def test_ping(client):
    assert (await client.get(f"{API}/ping")).json() == {"status": "ok"}


async def test_signup_activate_login_me_logout(client):
    res = await client.post(f"{API}/auth/signup", json=SIGNUP)
    assert res.status_code == 201
    body = res.json()
    assert body["qr_code"].startswith("data:image/png;base64,") and body["otpauth_url"].startswith("otpauth://totp/")
    assert "access_token" not in res.cookies

    totp = pyotp.TOTP(body["totp_secret"])
    # Cannot log in before activation
    pre = await client.post(f"{API}/auth/login", json={"email": SIGNUP["email"], "otp": totp.now()})
    assert pre.status_code == 401

    act = await client.post(f"{API}/auth/activate", json={"email": SIGNUP["email"], "otp": totp.now()})
    assert act.status_code == 200 and "access_token" not in act.cookies
    assert (await client.get(f"{API}/auth/me")).status_code == 401  # activation does not sign in
    assert (await client.post(f"{API}/auth/login", json={"email": SIGNUP["email"], "otp": totp.now()})).status_code == 200
    assert (await client.get(f"{API}/auth/me")).json()["email"] == "ravi@gmail.com"

    assert (await client.post(f"{API}/auth/logout")).status_code == 200
    client.cookies.clear()
    assert (await client.get(f"{API}/auth/me")).status_code == 401

    bad = await client.post(f"{API}/auth/login", json={"email": SIGNUP["email"], "otp": "123456" if totp.now() != "123456" else "654321"})
    assert bad.status_code == 401
    ok = await client.post(f"{API}/auth/login", json={"email": "RAVI@Gmail.com", "otp": totp.now()})
    assert ok.status_code == 200 and ok.json()["user"]["name"] == "Ravi Shankar"


@pytest.mark.parametrize("patch,code", [
    ({"email": "not-an-email"}, 422),
    ({"full_name": " "}, 422),
    ({"date_of_birth": "2999-01-01"}, 422),
    ({"date_of_birth": "not-a-date"}, 422),
    ({"email": "ravi@example.com"}, 422),
    ({"email": "ravi@infosys.com"}, 422),
])
async def test_signup_validation(client, patch, code):
    assert (await client.post(f"{API}/auth/signup", json={**SIGNUP, **patch})).status_code == code


async def test_otp_must_be_six_digits(client):
    res = await client.post(f"{API}/auth/login", json={"email": "a@b.co", "otp": "abc"})
    assert res.status_code == 422


async def test_duplicate_signup_only_after_activation(client):
    first = (await client.post(f"{API}/auth/signup", json=SIGNUP)).json()
    again = await client.post(f"{API}/auth/signup", json=SIGNUP)  # still inactive: re-issued
    assert again.status_code == 201 and again.json()["totp_secret"] != first["totp_secret"]
    await client.post(f"{API}/auth/activate", json={"email": SIGNUP["email"], "otp": pyotp.TOTP(again.json()["totp_secret"]).now()})
    res = await client.post(f"{API}/auth/signup", json={**SIGNUP, "email": "Ravi@Gmail.com"})
    assert res.status_code == 409


async def test_refresh(client, user):
    assert (await client.post(f"{API}/auth/refresh")).status_code == 200


async def test_refresh_keeps_other_signed_in_devices_valid(client):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    account, secret = await register(client)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        login = await other.post(f"{API}/auth/login", json={
            "email": account["email"], "otp": pyotp.TOTP(secret).now(),
        })
        assert login.status_code == 200
        assert (await client.post(f"{API}/auth/refresh")).status_code == 200
        assert (await other.post(f"{API}/auth/refresh")).status_code == 200
        assert (await client.post(f"{API}/auth/logout")).status_code == 200
        assert (await other.post(f"{API}/auth/refresh")).status_code == 200


async def test_overlapping_refresh_requests_reuse_the_same_rotation(client, user):
    original = client.cookies.get("refresh_token")
    first = await client.post(f"{API}/auth/refresh")
    assert first.status_code == 200
    current = first.cookies.get("refresh_token")
    assert current != original
    for token in [original, current, original]:
        response = await client.post(f"{API}/auth/refresh", headers={"Cookie": f"refresh_token={token}"})
        assert response.status_code == 200
        assert response.cookies.get("refresh_token") == current
    assert (await client.get(f"{API}/auth/session")).json()["refresh_expires_at"] is not None


@pytest.mark.parametrize("legacy", [False, True])
async def test_concurrent_refresh_rotates_atomically(client, user, monkeypatch, legacy):
    import asyncio
    from app.api.v1 import auth as auth_routes

    original = client.cookies.get("refresh_token")
    if legacy:
        from app.auth import auth_manager
        from app.database import async_session_factory
        from app.models import User
        original = auth_manager.create_refresh_token(user["id"])
        async with async_session_factory() as db:
            account = await db.get(User, user["id"])
            account.refresh_token = original
            await db.commit()
    lookup = auth_routes._stored_session
    ready = asyncio.Event()
    reads = 0

    async def synchronized_lookup(*args):
        nonlocal reads
        session = await lookup(*args)
        reads += 1
        if reads <= 2:
            if reads == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), timeout=5)
        return session

    monkeypatch.setattr(auth_routes, "_stored_session", synchronized_lookup)
    responses = await asyncio.gather(*[
        client.post(f"{API}/auth/refresh", headers={"Cookie": f"refresh_token={original}"})
        for _ in range(2)
    ])
    assert [r.status_code for r in responses] == [200, 200]
    assert responses[0].cookies.get("refresh_token") == responses[1].cookies.get("refresh_token")
    assert responses[0].cookies.get("refresh_token") != original


async def test_refresh_rejects_old_rotation_after_grace_and_logged_out_cookie(client, user):
    from datetime import datetime, timedelta
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models import RefreshSession

    original = client.cookies.get("refresh_token")
    assert (await client.post(f"{API}/auth/refresh")).status_code == 200
    current = client.cookies.get("refresh_token")
    async with async_session_factory() as db:
        session = await db.scalar(select(RefreshSession).where(RefreshSession.user_id == user["id"]))
        session.rotated_at = datetime.utcnow() - timedelta(seconds=61)
        await db.commit()
    assert (await client.post(f"{API}/auth/refresh", headers={"Cookie": f"refresh_token={original}"})).status_code == 401
    assert (await client.post(f"{API}/auth/refresh", headers={"Cookie": f"refresh_token={current}"})).status_code == 200
    current = client.cookies.get("refresh_token")
    assert (await client.post(f"{API}/auth/logout")).status_code == 200
    assert (await client.post(f"{API}/auth/refresh", headers={"Cookie": f"refresh_token={current}"})).status_code == 401


async def test_legacy_refresh_cookie_survives_upgrade_and_migrates(client, user):
    from sqlalchemy import delete
    from app.auth import auth_manager
    from app.database import async_session_factory
    from app.models import RefreshSession, User

    legacy = auth_manager.create_refresh_token(user["id"])
    async with async_session_factory() as db:
        await db.execute(delete(RefreshSession).where(RefreshSession.user_id == user["id"]))
        account = await db.get(User, user["id"])
        account.refresh_token = legacy
        await db.commit()
    cookies = f"access_token={client.cookies.get('access_token')}; refresh_token={legacy}"
    assert (await client.get(f"{API}/auth/session", headers={"Cookie": cookies})).json()["refresh_expires_at"] is not None
    refreshed = await client.post(f"{API}/auth/refresh", headers={"Cookie": cookies})
    assert refreshed.status_code == 200
    assert "sid" in auth_manager.verify_token(refreshed.cookies.get("refresh_token"), "refresh")
    assert (await client.post(f"{API}/auth/refresh", headers={"Cookie": cookies})).status_code == 200
    async with async_session_factory() as db:
        assert (await db.get(User, user["id"])).refresh_token is None


@pytest.mark.parametrize("operation", ["deactivate", "reset-totp"])
async def test_admin_revokes_all_device_refresh_sessions(client, operation):
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    user, secret = await register(client)
    original = client.cookies.get("refresh_token")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as device:
        assert (await device.post(f"{API}/auth/login", json={
            "email": user["email"], "otp": pyotp.TOTP(secret).now(),
        })).status_code == 200
        await register(client, "boss@gmail.com", "Boss")
        await _make_admin("boss@gmail.com")
        if operation == "deactivate":
            assert (await client.patch(f"{API}/admin/users/{user['id']}/status")).status_code == 200
            assert (await client.patch(f"{API}/admin/users/{user['id']}/status")).status_code == 200
        else:
            assert (await client.post(f"{API}/admin/users/{user['id']}/reset-totp")).status_code == 200
        assert (await device.post(f"{API}/auth/refresh")).status_code == 401
        assert (await device.post(f"{API}/auth/refresh", headers={"Cookie": f"refresh_token={original}"})).status_code == 401


async def test_session_expiry_metadata_survives_reload_and_refresh(client, user):
    from app.auth import auth_manager

    before = (await client.get(f"{API}/auth/session"))
    assert before.status_code == 200
    data = before.json()
    access = auth_manager.verify_token(client.cookies.get("access_token"))
    refresh = auth_manager.verify_token(client.cookies.get("refresh_token"), "refresh")
    assert data["expires_at"] == access["exp"] * 1000
    assert data["refresh_expires_at"] == refresh["exp"] * 1000
    assert data["server_time"] < data["expires_at"] < data["refresh_expires_at"]
    assert before.headers["cache-control"] == "no-store"
    assert "access_token" not in data and "refresh_token" not in data
    assert (await client.get(f"{API}/auth/session")).json()["expires_at"] == data["expires_at"]

    rotated = (await client.post(f"{API}/auth/refresh")).json()
    assert (await client.get(f"{API}/auth/session")).json()["expires_at"] == rotated["expires_at"]
    assert rotated["refresh_expires_at"] == auth_manager.verify_token(client.cookies.get("refresh_token"), "refresh")["exp"] * 1000

    client.cookies.delete("access_token")
    assert (await client.get(f"{API}/auth/session")).status_code == 401
    assert (await client.post(f"{API}/auth/refresh")).status_code == 200
    assert (await client.get(f"{API}/auth/session")).status_code == 200


def test_refresh_minutes_override_days_and_days_fallback():
    from app.database import Settings

    config = Settings(_env_file=None, JWT_SECRET_KEY="test-only", REFRESH_TOKEN_EXPIRE_DAYS=2)
    assert config.REFRESH_TOKEN_EXPIRE_MINUTES == 2880
    config = Settings(_env_file=None, JWT_SECRET_KEY="test-only", REFRESH_TOKEN_EXPIRE_DAYS=2, REFRESH_TOKEN_EXPIRE_MINUTES=60)
    assert config.REFRESH_TOKEN_EXPIRE_MINUTES == 60


async def test_login_rate_limited(client):
    codes = [
        (await client.post(f"{API}/auth/login", json={"email": "a@b.co", "otp": "123456"})).status_code
        for _ in range(12)
    ]
    assert codes[-1] == 429


@pytest.mark.parametrize("method,path", [
    ("get", "/profile"), ("get", "/preferences"), ("get", "/connections"), ("get", "/jobs"),
    ("get", "/applications"), ("get", "/applications/stats"), ("get", "/auto-apply/status"),
    ("post", "/auto-apply/run"),
])
async def test_requires_auth(client, method, path):
    assert (await getattr(client, method)(f"{API}{path}")).status_code == 401


# ---------- profile, resume, preferences ----------

@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP"])
async def test_profile_photo_upload_persists_and_removes(client, user, format):
    photo = io.BytesIO()
    exif = Image.Exif()
    exif[315] = "Private camera owner"
    exif[274] = 6
    Image.new("RGB", (640, 480), "blue").save(photo, format=format, exif=exif)
    response = await client.post(
        f"{API}/profile/avatar", files={"file": ("photo", photo.getvalue(), "application/octet-stream")}
    )
    assert response.status_code == 200
    avatar = response.json()["avatar"]
    assert avatar.startswith("data:image/jpeg;base64,")
    with Image.open(io.BytesIO(base64.b64decode(avatar.split(",")[1]))) as normalized:
        assert normalized.format == "JPEG" and max(normalized.size) == 256
        assert normalized.height > normalized.width  # EXIF orientation was applied.
        assert not normalized.getexif()
    # Each endpoint loads a new session, rather than returning an in-memory upload.
    assert (await client.get(f"{API}/auth/me")).json()["avatar"] == avatar
    assert (await client.get(f"{API}/auth/session")).json()["user"]["avatar"] == avatar
    assert (await client.delete(f"{API}/profile/avatar")).json()["avatar"] is None
    assert (await client.get(f"{API}/auth/me")).json()["avatar"] is None


@pytest.mark.parametrize("case", ["empty", "svg", "corrupt", "too-large", "dimensions"])
async def test_profile_photo_rejects_invalid_images_without_replacing_photo(client, user, case):
    valid = io.BytesIO()
    Image.new("RGB", (32, 32), "red").save(valid, format="PNG")
    original = (await client.post(f"{API}/profile/avatar", files={"file": ("photo.png", valid.getvalue())})).json()["avatar"]
    bad = {
        "empty": b"",
        "svg": b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        "corrupt": b"\xff\xd8\xffnot-a-jpeg",
        "too-large": b"x" * (2 * 1024 * 1024 + 1),
    }
    if case == "dimensions":
        image = io.BytesIO()
        Image.new("1", (5000, 4000)).save(image, format="PNG")
        payload = image.getvalue()
    else:
        payload = bad[case]
    response = await client.post(f"{API}/profile/avatar", files={"file": ("photo.jpg", payload, "image/jpeg")})
    assert response.status_code == (413 if case == "too-large" else 422)
    assert (await client.get(f"{API}/auth/me")).json()["avatar"] == original


async def test_profile_photos_are_account_scoped(client):
    file = io.BytesIO()
    Image.new("RGB", (16, 16), "green").save(file, format="PNG")
    assert (await client.post(f"{API}/profile/avatar", files={"file": ("photo.png", file.getvalue())})).status_code == 401
    assert (await client.delete(f"{API}/profile/avatar")).status_code == 401
    first, secret = await register(client)
    avatar = (await client.post(f"{API}/profile/avatar", files={"file": ("photo.png", file.getvalue())})).json()["avatar"]
    second, _ = await register(client, email="second@gmail.com")
    assert second["avatar"] is None
    assert (await client.delete(f"{API}/profile/avatar")).json()["avatar"] is None
    await client.post(f"{API}/auth/login", json={"email": first["email"], "otp": pyotp.TOTP(secret).now()})
    assert (await client.get(f"{API}/auth/me")).json()["avatar"] == avatar


async def test_profile_and_resume_upload(client, user):
    res = await client.put(f"{API}/profile", json={"headline": "Backend dev", "skills": ["reactjs", "React", "Python"]})
    assert res.json()["skills"] == ["React", "Python"]

    resume = b"Jane Doe\nSkills: Python, FastAPI, Docker, PostgreSQL, AWS, and C++\n"
    up = await client.post(f"{API}/profile/resume", files={"file": ("cv.txt", io.BytesIO(resume), "text/plain")})
    assert up.status_code == 200
    body = up.json()
    assert {"Python", "FastAPI", "Docker", "PostgreSQL", "AWS", "C++", "React"} <= set(body["skills"])
    assert body["resume_filename"] == "cv.txt" and body["completeness"] > 0

    dl = await client.get(f"{API}/profile/resume")
    assert dl.status_code == 200 and dl.content == resume
    assert (await client.delete(f"{API}/profile/resume")).json()["resume_filename"] is None
    assert (await client.get(f"{API}/profile/resume")).status_code == 404


@pytest.mark.parametrize("name,data", [
    ("cv.exe", b"MZ"), ("cv.pdf", b"not a pdf"), ("cv.docx", b"not docx"), ("cv.txt", b""), ("cv.txt", b"   \n"),
])
async def test_resume_rejects_bad_files(client, user, name, data):
    res = await client.post(f"{API}/profile/resume", files={"file": (name, io.BytesIO(data), "application/octet-stream")})
    assert res.status_code in (400, 422)


async def test_resume_docx_and_pdf(client, user):
    from docx import Document
    doc = Document()
    doc.add_paragraph("Experienced in Kubernetes and Terraform")
    buf = io.BytesIO()
    doc.save(buf)
    res = await client.post(f"{API}/profile/resume", files={"file": ("cv.docx", buf.getvalue(), "application/octet-stream")})
    assert res.status_code == 200 and {"Kubernetes", "Terraform"} <= set(res.json()["skills"])


async def test_preferences(client, user):
    assert (await client.get(f"{API}/preferences")).json()["auto_apply_enabled"] is False
    res = await client.put(f"{API}/preferences", json={
        "job_titles": ["Python Developer", " python developer ", ""], "locations": ["Chennai", "Remote"],
        "job_types": ["full_time"], "daily_limit": 5, "min_match_score": 50, "min_salary_lpa": 10,
    })
    data = res.json()
    assert res.status_code == 200 and data["job_titles"] == ["Python Developer"] and data["daily_limit"] == 5
    assert (await client.put(f"{API}/preferences", json={"daily_limit": 0})).status_code == 422
    assert (await client.put(f"{API}/preferences", json={"job_types": ["bogus"]})).status_code == 422
    cleared = await client.put(f"{API}/preferences", json={"min_salary_lpa": None})
    assert cleared.json()["min_salary_lpa"] is None and cleared.json()["daily_limit"] == 5


# ---------- connections ----------

async def test_connections(client, user):
    listing = (await client.get(f"{API}/connections")).json()
    assert {c["platform"] for c in listing} >= {"linkedin", "naukri"} and not any(c["connected"] for c in listing)

    ok = await client.put(f"{API}/connections/linkedin", json={"profile_url": "https://www.linkedin.com/in/asha"})
    assert ok.status_code == 200 and ok.json()["connected"]
    assert (await client.put(f"{API}/connections/naukri", json={"handle": "asha@gmail.com"})).status_code == 200
    assert (await client.put(f"{API}/connections/linkedin", json={"profile_url": "https://evil.com/linkedin.com"})).status_code == 422
    assert (await client.put(f"{API}/connections/linkedin", json={"profile_url": "https://notlinkedin.com/in/x"})).status_code == 422
    assert (await client.put(f"{API}/connections/indeed", json={})).status_code == 422
    assert (await client.put(f"{API}/connections/myspace", json={"handle": "x1"})).status_code == 404
    assert sum(c["connected"] for c in (await client.get(f"{API}/connections")).json()) == 2
    assert (await client.delete(f"{API}/connections/linkedin")).json()["connected"] is False


# ---------- jobs & applications ----------

async def test_jobs_catalogue_and_matching(client, user):
    await client.put(f"{API}/profile", json={"skills": ["Python", "FastAPI", "Docker", "PostgreSQL", "REST API"]})
    await client.put(f"{API}/preferences", json={"job_titles": ["Python Backend Developer"], "locations": ["Remote", "Chennai"]})
    jobs = (await client.get(f"{API}/jobs?limit=100")).json()
    assert len(jobs) >= 40
    assert jobs[0]["match_score"] >= jobs[-1]["match_score"]
    top = jobs[0]
    assert "Python" in top["title"] and top["matched_skills"]

    assert all("Data" in j["title"] for j in (await client.get(f"{API}/jobs?search=data&limit=100")).json())
    assert all(j["source"] == "naukri" for j in (await client.get(f"{API}/jobs?source=naukri")).json())
    assert (await client.get(f"{API}/jobs?search=%25")).json() == []
    assert (await client.get(f"{API}/jobs?min_match=101")).status_code == 422
    assert (await client.get(f"{API}/jobs/{top['id']}")).json()["id"] == top["id"]
    assert (await client.get(f"{API}/jobs/999999")).status_code == 404


async def test_manual_job_and_application_lifecycle(client, user):
    created = await client.post(f"{API}/jobs", json={
        "title": "Platform Engineer", "company": "Acme", "location": "Pune", "external_link": "https://acme.example/jobs/1",
        "source": "linkedin", "skills": ["Python", "AWS"],
    })
    assert created.status_code == 201 and created.json()["is_own"]
    job_id = created.json()["id"]
    assert (await client.post(f"{API}/jobs", json={"title": "x", "company": "y"})).status_code == 422
    assert (await client.post(f"{API}/jobs", json={"title": "Dev", "company": "y", "external_link": "javascript:alert(1)"})).status_code == 422

    app = await client.post(f"{API}/applications", json={"job_id": job_id, "notes": "Referred by Sam"})
    assert app.status_code == 201 and app.json()["status"] == "applied"
    app_id = app.json()["id"]
    assert (await client.post(f"{API}/applications", json={"job_id": job_id})).status_code == 409
    assert (await client.post(f"{API}/applications", json={"job_id": 999999})).status_code == 404

    upd = await client.patch(f"{API}/applications/{app_id}", json={"status": "interview_scheduled", "interview_date": "2030-01-05T10:00:00"})
    assert upd.status_code == 200 and upd.json()["status"] == "interview_scheduled"
    assert upd.json()["interview_date"].endswith("Z")
    assert (await client.patch(f"{API}/applications/{app_id}", json={"status": "bogus"})).status_code == 422
    assert len((await client.get(f"{API}/applications?status=interview_scheduled")).json()) == 1
    assert (await client.get(f"{API}/applications?status=offer")).json() == []

    stats = (await client.get(f"{API}/applications/stats")).json()
    assert stats["total_applications"] == 1 and stats["interviews"] == 1 and stats["response_rate"] == 100

    assert (await client.delete(f"{API}/applications/{app_id}")).status_code == 200
    assert (await client.get(f"{API}/applications/{app_id}")).status_code == 404
    stats = (await client.get(f"{API}/applications/stats")).json()
    assert stats["total_applications"] == stats["interviews"] == stats["response_rate"] == 0
    assert stats["by_status"] == stats["by_source"] == stats["by_day"] == {}
    assert stats["recent"] == []
    assert (await client.get(f"{API}/jobs/{job_id}")).json()["applied"] is False
    assert (await client.delete(f"{API}/jobs/{job_id}")).status_code == 200


async def test_deleting_owned_job_updates_related_counts(client, user):
    job = (await client.post(f"{API}/jobs", json={"title": "Engineer", "company": "Acme", "source": "indeed"})).json()
    app = (await client.post(f"{API}/applications", json={"job_id": job["id"], "status": "offer"})).json()
    await client.put(f"{API}/connections/indeed", json={"handle": "asha"})
    assert (await client.get(f"{API}/applications/stats")).json()["offers"] == 1
    assert (await client.delete(f"{API}/jobs/{job['id']}")).status_code == 200
    assert (await client.get(f"{API}/applications/{app['id']}")).status_code == 404
    assert (await client.get(f"{API}/applications")).json() == []
    stats = (await client.get(f"{API}/applications/stats")).json()
    assert stats["total_applications"] == stats["offers"] == 0
    assert stats["by_day"] == stats["by_status"] == stats["by_source"] == {}
    assert stats["connected_platforms"] == 1
    assert (await client.delete(f"{API}/connections/indeed")).status_code == 200
    assert (await client.get(f"{API}/applications/stats")).json()["connected_platforms"] == 0
    await _make_admin(user["email"])
    row = (await client.get(f"{API}/admin/users")).json()["users"][0]
    assert row["applications"] == row["connections"] == 0


async def test_users_are_isolated(client, user):
    job = (await client.post(f"{API}/jobs", json={"title": "Secret Role", "company": "Hush"})).json()
    app = (await client.post(f"{API}/applications", json={"job_id": job["id"]})).json()
    await client.post(f"{API}/auth/logout")
    client.cookies.clear()

    await register(client, SIGNUP["email"], SIGNUP["full_name"])
    assert (await client.get(f"{API}/applications")).json() == []
    assert (await client.get(f"{API}/applications/{app['id']}")).status_code == 404
    assert (await client.patch(f"{API}/applications/{app['id']}", json={"notes": "x"})).status_code == 404
    assert (await client.delete(f"{API}/applications/{app['id']}")).status_code == 404
    assert (await client.get(f"{API}/jobs/{job['id']}")).status_code == 404
    assert (await client.delete(f"{API}/jobs/{job['id']}")).status_code == 404
    assert (await client.post(f"{API}/applications", json={"job_id": job["id"]})).status_code == 404
    assert "Secret Role" not in (await client.get(f"{API}/jobs?limit=100")).text


# ---------- auto apply ----------

async def test_auto_apply_requires_setup(client, user):
    status = (await client.get(f"{API}/auto-apply/status")).json()
    assert status["ready"] is False and len(status["blockers"]) == 3
    assert status["schedule_interval_minutes"] == 0
    assert status["next_scheduled_at"] is None and status["scheduled_sweep_running"] is False
    assert (await client.post(f"{API}/auto-apply/run")).status_code == 400


async def test_free_plan_has_lifetime_auto_apply_cap(client, user, monkeypatch):
    from app.database import settings
    monkeypatch.setattr(settings, "FREE_TOTAL_APPLY_LIMIT", 2)
    await client.put(f"{API}/profile", json={"skills": ["Python", "FastAPI", "Docker", "PostgreSQL", "REST API", "AWS", "Django"]})
    await client.put(f"{API}/preferences", json={
        "job_titles": ["Python Backend Developer", "Python Engineer"], "locations": ["Remote", "Bengaluru", "Chennai"],
        "daily_limit": 10, "min_match_score": 50, "auto_apply_enabled": True,
    })
    await client.put(f"{API}/connections/linkedin", json={"handle": "asha_linkedin"})
    assert (await client.post(f"{API}/auto-apply/run")).json()["applied"] == 2
    again = (await client.post(f"{API}/auto-apply/run")).json()
    assert again["applied"] == 0 and "Free plan limit" in again["message"]
    status = (await client.get(f"{API}/auto-apply/status")).json()
    assert status["lifetime_used"] == 2 and status["lifetime_limit"] == 2


async def test_auto_apply_end_to_end(client, user):
    await client.put(f"{API}/profile", json={"skills": ["Python", "FastAPI", "Docker", "PostgreSQL", "REST API", "AWS", "Django"]})
    await client.put(f"{API}/preferences", json={
        "job_titles": ["Python Backend Developer", "Python Engineer"], "locations": ["Remote", "Bengaluru", "Chennai"],
        "daily_limit": 3, "min_match_score": 50, "auto_apply_enabled": True,
    })
    for platform in ("linkedin", "naukri", "indeed"):
        assert (await client.put(f"{API}/connections/{platform}", json={"handle": f"asha_{platform}"})).status_code == 200

    status = (await client.get(f"{API}/auto-apply/status")).json()
    assert status["ready"] and status["enabled"] and sorted(status["connected_platforms"]) == ["indeed", "linkedin", "naukri"]

    run = (await client.post(f"{API}/auto-apply/run")).json()
    assert run["applied"] == 3 and run["evaluated"] > 0
    apps = (await client.get(f"{API}/applications")).json()
    assert len(apps) == 3 and all(a["auto_applied"] and a["match_score"] >= 50 for a in apps)
    assert all(a["job"]["source"] in ("linkedin", "naukri", "indeed") for a in apps)

    again = (await client.post(f"{API}/auto-apply/run")).json()
    assert again["applied"] == 0 and "limit" in again["message"]
    assert (await client.get(f"{API}/auto-apply/status")).json()["applied_today"] == 3
    assert len((await client.get(f"{API}/auto-apply/runs")).json()) == 2
    assert (await client.get(f"{API}/applications/stats")).json()["auto_applied"] == 3


async def test_auto_apply_run_job_details_persist_and_are_private(client, user, monkeypatch):
    from datetime import datetime
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from sqlalchemy import func, select, update
    from app.database import async_session_factory
    from app.models import AutoApplyRunJob, Job
    from app.services import auto_apply

    monkeypatch.setattr(auto_apply, "sync_for_preferences", AsyncMock())
    monkeypatch.setattr(auto_apply, "score_job", lambda job, *_: SimpleNamespace(
        eligible=True, score={"Recorded role": 95, "Queued role": 90, "Skipped role": 20}[job.title],
    ))
    await client.put(f"{API}/profile", json={"skills": ["Python"]})
    await client.put(f"{API}/preferences", json={
        "job_titles": ["Engineer"], "daily_limit": 3, "min_match_score": 50,
    })
    await client.put(f"{API}/connections/linkedin", json={"handle": "preview"})
    async with async_session_factory() as db:
        await db.execute(update(Job).values(is_active=False))
        recorded = Job(
            title="Recorded role", company="Recorded company", location="Remote", source="linkedin",
            job_url="https://example.test/recorded",
            description="Build Python services.", salary_min_lpa=12, salary_max_lpa=20,
            job_type="full_time", is_remote=True, experience_min=2, experience_max=5,
            skills=["Python", "FastAPI"], posted_date=datetime(2026, 1, 1, 9),
        )
        db.add_all([recorded, Job(
            title="Queued role", company="Feed company", location="Preview city", source="other",
            external_id="remotive-run-details", job_url="https://example.test/queued",
        ), Job(title="Skipped role", company="Skipped company", source="linkedin", job_url="https://example.test/skipped")])
        await db.commit()
        job_id = recorded.id

    first = (await client.post(f"{API}/auto-apply/run")).json()
    assert first["applied"] == 2 and first["evaluated"] == 3 and first["skipped"] == 1
    assert first["details_recorded"] is True
    endpoint = f"{API}/auto-apply/runs/{first['id']}"
    detail = (await client.get(endpoint)).json()
    assert [(job["title"], job["company"], job["match_score"], job["outcome"]) for job in detail["jobs"]] == [
        ("Recorded role", "Recorded company", 95, "applied"),
        ("Queued role", "Feed company", 90, "to_apply"),
    ]
    assert detail["jobs"][0]["location"] == "Remote" and detail["jobs"][0]["source"] == "linkedin"
    assert detail["jobs"][1]["external_link"] == "https://example.test/queued"
    apps = (await client.get(f"{API}/applications")).json()
    by_id = {application["id"]: application for application in apps}
    for snapshot in detail["jobs"]:
        application = by_id[snapshot["application_id"]]
        assert snapshot["applied_at"] == application["applied_at"]
        assert snapshot["application"]["id"] == application["id"]
        assert snapshot["application"]["status"] == application["status"]
    assert detail["jobs"][0]["job_details"] == {
        "description": "Build Python services.", "salary_min_lpa": 12, "salary_max_lpa": 20,
        "job_type": "full_time", "is_remote": True, "experience_min": 2, "experience_max": 5,
        "skills": ["Python", "FastAPI"], "posted_date": "2026-01-01T09:00:00+00:00",
    }
    assert detail["jobs"][1]["job_details"]["salary_min_lpa"] is None

    def saved_jobs(payload):
        return [{key: value for key, value in job.items() if key != "application"} for job in payload["jobs"]]

    for application in apps:
        await client.patch(f"{API}/applications/{application['id']}", json={
            "status": "offer", "notes": "Offer accepted for review.", "offer_salary_lpa": 25,
            "interview_date": "2030-01-02T09:00:00Z",
        })
    async with async_session_factory() as db:
        recorded = await db.get(Job, job_id)
        recorded.title = "Renamed after the run"
        recorded.salary_min_lpa = 999
        recorded.description = "Changed after the run."
        await db.commit()
    updated = (await client.get(endpoint)).json()
    assert saved_jobs(updated) == saved_jobs(detail)
    for snapshot in updated["jobs"]:
        assert snapshot["application"]["status"] == "offer"
        assert snapshot["application"]["notes"] == "Offer accepted for review."
        assert snapshot["application"]["offer_salary_lpa"] == 25
        assert snapshot["application"]["interview_date"] == "2030-01-02T09:00:00Z"
    for application in apps:
        await client.delete(f"{API}/applications/{application['id']}")
    await client.delete(f"{API}/connections/linkedin")
    # Removing tracker entries and links must not erase the run's saved evidence.
    deleted = (await client.get(endpoint)).json()
    assert saved_jobs(deleted) == saved_jobs(detail)
    assert all(snapshot["application"] is None for snapshot in deleted["jobs"])
    async with async_session_factory() as db:
        recorded = await db.get(Job, job_id)
        await db.delete(recorded)
        await db.commit()
    assert (await client.get(endpoint)).json() == deleted

    await client.put(f"{API}/connections/linkedin", json={"handle": "preview"})
    second = (await client.post(f"{API}/auto-apply/run")).json()
    second_detail = (await client.get(f"{API}/auto-apply/runs/{second['id']}")).json()
    assert second["id"] != first["id"] and [job["title"] for job in second_detail["jobs"]] == ["Queued role"]
    assert second_detail["jobs"][0]["application"]["id"] == second_detail["jobs"][0]["application_id"]
    assert (await client.get(endpoint)).json() == deleted
    assert (await client.get(f"{API}/auto-apply/runs/999999")).status_code == 404

    await register(client, "other-run@gmail.com", "Other")
    assert (await client.get(endpoint)).status_code == 404
    assert (await client.get(f"{API}/auto-apply/runs")).json() == []
    await _make_admin("other-run@gmail.com")
    assert (await client.delete(f"{API}/admin/users/{user['id']}")).status_code == 204
    async with async_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(AutoApplyRunJob)) == 0
    client.cookies.clear()
    assert (await client.get(endpoint)).status_code == 401


async def test_scheduled_sweep(client, user):
    from app.services.auto_apply import sweep_all_users
    await client.put(f"{API}/profile", json={"skills": ["Python", "FastAPI", "Docker", "AWS"]})
    await client.put(f"{API}/preferences", json={"job_titles": ["Python Backend Developer"], "min_match_score": 40, "auto_apply_enabled": True, "locations": []})
    await client.put(f"{API}/connections/linkedin", json={"handle": "asha_li"})
    await client.put(f"{API}/connections/naukri", json={"handle": "asha_nk"})
    assert await sweep_all_users() > 0
    assert len((await client.get(f"{API}/applications")).json()) > 0
    run = (await client.get(f"{API}/auto-apply/runs")).json()[0]
    detail = (await client.get(f"{API}/auto-apply/runs/{run['id']}")).json()
    assert detail["trigger"] == "scheduled" and len(detail["jobs"]) == run["applied"]


# ---------- admin ----------

async def _make_admin(email):
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models import User
    async with async_session_factory() as db:
        u = await db.scalar(select(User).where(User.email == email))
        u.role = "admin"
        await db.commit()


async def test_admin_requires_admin_role(client, user):
    assert (await client.get("/api/v1/admin/users")).status_code == 403
    assert (await client.post(f"{API}/admin/users/{user['id']}/pro")).status_code == 403
    assert (await client.delete(f"{API}/admin/users/{user['id']}/pro")).status_code == 403


async def test_remove_pro_requires_authentication(client):
    assert (await client.delete(f"{API}/admin/users/1/pro")).status_code == 401


async def test_pro_welcome_once_per_activation_and_account(client):
    from asyncio import gather
    from httpx import Cookies

    endpoint = f"{API}/profile/pro-welcome"
    assert (await client.post(endpoint)).status_code == 401
    target, _ = await register(client)
    target_cookies = Cookies(client.cookies)
    assert (await client.post(endpoint)).json() == {"show": False}
    await register(client, "boss@gmail.com", "Boss")
    await _make_admin("boss@gmail.com")
    admin_cookies = Cookies(client.cookies)

    await client.post(f"{API}/admin/users/{target['id']}/pro")
    assert (await client.post(endpoint)).json() == {"show": False}
    client.cookies.clear()
    client.cookies.update(target_cookies)
    assert (await client.get(f"{API}/auth/me")).json()["pro_welcome_pending"] is True
    claims = await gather(client.post(endpoint), client.post(endpoint))
    assert sorted(response.json()["show"] for response in claims) == [False, True]
    assert (await client.get(f"{API}/auth/session")).json()["user"]["pro_welcome_pending"] is False
    assert (await client.post(f"{API}/auth/refresh")).json()["user"]["pro_welcome_pending"] is False
    target_cookies = Cookies(client.cookies)

    client.cookies.clear()
    client.cookies.update(admin_cookies)
    await client.post(f"{API}/admin/users/{target['id']}/pro")
    client.cookies.clear()
    client.cookies.update(target_cookies)
    assert (await client.post(endpoint)).json() == {"show": False}

    client.cookies.clear()
    client.cookies.update(admin_cookies)
    await client.delete(f"{API}/admin/users/{target['id']}/pro")
    await client.post(f"{API}/admin/users/{target['id']}/pro")
    client.cookies.clear()
    client.cookies.update(target_cookies)
    assert (await client.post(endpoint)).json() == {"show": True}
    assert (await client.post(endpoint)).json() == {"show": False}


@pytest.mark.parametrize("plan,days,pending", [("free", 1, True), ("pro", -1, True), ("pro", 1, False)])
async def test_pro_welcome_requires_active_unseen_pro(client, user, plan, days, pending):
    from datetime import datetime, timedelta
    from app.database import async_session_factory
    from app.models import User

    async with async_session_factory() as db:
        target = await db.get(User, user["id"])
        target.plan = plan
        target.plan_expires_at = datetime.utcnow() + timedelta(days=days)
        target.pro_welcome_pending = pending
        await db.commit()
    assert (await client.post(f"{API}/profile/pro-welcome")).json() == {"show": False}


async def test_admin_grants_and_extends_complimentary_pro(client, user, monkeypatch):
    from datetime import datetime, timedelta
    from sqlalchemy import func, select
    from app.database import async_session_factory, settings
    from app.models import Notification, Order, Subscription, User

    monkeypatch.setattr(settings, "PRO_DAYS", 11)
    user_cookies = dict(client.cookies)
    async with async_session_factory() as db:
        target = await db.get(User, user["id"])
        target.plan = "pro"
        target.plan_expires_at = datetime.utcnow() - timedelta(days=1)
        await db.commit()
    await register(client, "boss@gmail.com", "Boss")
    await _make_admin("boss@gmail.com")
    listing = (await client.get(f"{API}/admin/users")).json()
    assert listing["pro_days"] == 11
    target = next(row for row in listing["users"] if row["id"] == user["id"])
    assert target["plan"] == "free" and target["plan_expires_at"] is None
    assert (await client.post(f"{API}/admin/users/999999/pro")).status_code == 404

    before = datetime.utcnow()
    granted = await client.post(f"{API}/admin/users/{user['id']}/pro")
    assert granted.status_code == 200 and granted.json()["plan"] == "pro"
    first_expiry = datetime.fromisoformat(granted.json()["plan_expires_at"]).replace(tzinfo=None)
    assert before + timedelta(days=11) <= first_expiry <= datetime.utcnow() + timedelta(days=11)
    extended = (await client.post(f"{API}/admin/users/{user['id']}/pro")).json()
    assert datetime.fromisoformat(extended["plan_expires_at"]).replace(tzinfo=None) == first_expiry + timedelta(days=11)
    detail = (await client.get(f"{API}/admin/users/{user['id']}/details")).json()["user"]
    assert detail["plan"] == "pro" and detail["plan_expires_at"] == extended["plan_expires_at"]

    async with async_session_factory() as db:
        subs = (await db.scalars(select(Subscription).where(Subscription.user_id == user["id"]).order_by(Subscription.id))).all()
        assert len(subs) == 2 and all(sub.order_id is None and sub.status == "ACTIVE" for sub in subs)
        assert subs[1].start_date == first_expiry
        assert subs[1].end_date == first_expiry + timedelta(days=11)
        assert await db.scalar(select(func.count()).select_from(Order)) == 0
        assert await db.scalar(select(func.count()).select_from(Notification).where(
            Notification.user_id == user["id"], Notification.title == "Pro access granted",
        )) == 2
    client.cookies.clear()
    client.cookies.update(user_cookies)
    billing = (await client.get(f"{API}/billing/me")).json()
    assert billing["plan"] == "pro" and billing["plan_expires_at"] == extended["plan_expires_at"]
    assert billing["lifetime_limit"] is None and billing["daily_limit"] == settings.PRO_DAILY_APPLY_LIMIT
    assert (await client.get(f"{API}/auto-apply/status")).json()["lifetime_limit"] is None
    assert (await client.get(f"{API}/auth/me")).json()["pro_welcome_pending"] is True
    assert (await client.post(f"{API}/profile/pro-welcome")).json() == {"show": True}


@pytest.mark.parametrize("paid", [False, True])
async def test_admin_removes_pro_preserving_history_and_usage(client, user, monkeypatch, paid):
    from datetime import datetime, timedelta
    from sqlalchemy import func, select
    from app.database import async_session_factory, settings
    from app.models import Application, Job, Notification, Order, Subscription, Transaction, User

    monkeypatch.setattr(settings, "FREE_TOTAL_APPLY_LIMIT", 1)
    user_cookies = dict(client.cookies)
    now = datetime.utcnow()
    paid_expiry = now + timedelta(days=30)
    async with async_session_factory() as db:
        job = Job(title="Preview role", company="Preview", job_url="https://example.test/job")
        db.add(job)
        await db.flush()
        db.add(Application(user_id=user["id"], job_id=job.id, auto_applied=True))
        if paid:
            target = await db.get(User, user["id"])
            target.plan, target.plan_expires_at = "pro", paid_expiry
            order = Order(
                user_id=user["id"], order_ref="JP-REVOKE-TEST", base_amount=9900, unique_amount=9901,
                status="PAID", expires_at=now, paid_at=now, invoice_no="INV-REVOKE-TEST",
            )
            db.add(order)
            await db.flush()
            db.add(Transaction(order_id=order.id, utr_number="123456789012", verification_source="ADMIN"))
            db.add(Subscription(
                user_id=user["id"], order_id=order.id, plan_id="pro", status="ACTIVE",
                start_date=now, end_date=paid_expiry,
            ))
        await db.commit()
    boss, _ = await register(client, "boss@gmail.com", "Boss")
    await _make_admin("boss@gmail.com")
    assert (await client.post(f"{API}/admin/users/{boss['id']}/pro")).status_code == 200
    for _ in range(2):
        assert (await client.post(f"{API}/admin/users/{user['id']}/pro")).status_code == 200

    removed = await client.delete(f"{API}/admin/users/{user['id']}/pro")
    assert removed.status_code == 200
    assert removed.json()["plan"] == "free" and removed.json()["plan_expires_at"] is None
    assert (await client.delete(f"{API}/admin/users/{user['id']}/pro")).status_code == 409
    async with async_session_factory() as db:
        target = await db.get(User, user["id"])
        assert target.plan == "free" and target.plan_expires_at is None
        subs = (await db.scalars(select(Subscription).where(Subscription.user_id == user["id"]))).all()
        assert len(subs) == 2 + int(paid) and all(sub.status == "CANCELLED" for sub in subs)
        assert (await db.scalar(select(Subscription).where(Subscription.user_id == boss["id"]))).status == "ACTIVE"
        assert (await db.get(User, boss["id"])).plan == "pro"
        assert await db.scalar(select(func.count()).select_from(Order)) == int(paid)
        assert await db.scalar(select(func.count()).select_from(Transaction)) == int(paid)
        if paid:
            order = await db.scalar(select(Order))
            assert order.status == "PAID" and order.invoice_no == "INV-REVOKE-TEST"
            original = next(sub for sub in subs if sub.order_id == order.id)
            assert original.start_date == now and original.end_date == paid_expiry
        assert await db.scalar(select(func.count()).select_from(Notification).where(
            Notification.user_id == user["id"], Notification.title == "Pro access removed",
        )) == 1

    admin_cookies = dict(client.cookies)
    client.cookies.clear()
    client.cookies.update(user_cookies)
    billing = (await client.get(f"{API}/billing/me")).json()
    assert billing["plan"] == "free" and billing["plan_expires_at"] is None
    assert billing["lifetime_used"] == 1 and billing["lifetime_limit"] == 1
    assert (await client.get(f"{API}/auto-apply/status")).json()["lifetime_limit"] == 1
    assert (await client.get(f"{API}/auth/me")).json()["plan"] == "free"
    if paid:
        invoice = await client.get(f"{API}/billing/orders/{order.id}/invoice")
        assert invoice.status_code == 200 and invoice.content.startswith(b"%PDF")
    client.cookies.clear()
    client.cookies.update(admin_cookies)
    assert (await client.post(f"{API}/admin/users/{user['id']}/pro")).json()["plan"] == "pro"
    async with async_session_factory() as db:
        subs = (await db.scalars(select(Subscription).where(Subscription.user_id == user["id"]))).all()
        assert sum(sub.status == "ACTIVE" for sub in subs) == 1
        assert sum(sub.status == "CANCELLED" for sub in subs) == 2 + int(paid)


async def test_admin_remove_pro_rejects_missing_or_free_account(client, user):
    from datetime import datetime, timedelta
    from sqlalchemy import func, select
    from app.database import async_session_factory
    from app.models import Notification, User

    await _make_admin(user["email"])
    assert (await client.delete(f"{API}/admin/users/999999/pro")).status_code == 404
    assert (await client.delete(f"{API}/admin/users/{user['id']}/pro")).status_code == 409
    async with async_session_factory() as db:
        target = await db.get(User, user["id"])
        target.plan, target.plan_expires_at = "pro", datetime.utcnow() - timedelta(days=1)
        await db.commit()
    assert (await client.delete(f"{API}/admin/users/{user['id']}/pro")).status_code == 409
    async with async_session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Notification).where(
            Notification.title == "Pro access removed",
        )) == 0
    assert (await client.post(f"{API}/admin/users/{user['id']}/pro")).status_code == 200
    removed_self = await client.delete(f"{API}/admin/users/{user['id']}/pro")
    assert removed_self.json()["plan"] == "free" and removed_self.json()["role"] == "admin"
    assert (await client.get(f"{API}/admin/users")).status_code == 200


async def test_admin_user_management(client):
    import pyotp
    from helpers import register
    await register(client, "boss@gmail.com", "Boss")
    await _make_admin("boss@gmail.com")
    listing = (await client.get("/api/v1/admin/users")).json()
    assert listing["total"] == 1

    made = await client.post("/api/v1/admin/users", json={"email": "new@gmail.com", "name": "New", "role": "user"})
    assert made.status_code == 201 and made.json()["qr_code"].startswith("data:image")
    assert (await client.post("/api/v1/admin/users", json={"email": "new@gmail.com"})).status_code == 409
    assert (await client.post("/api/v1/admin/users", json={"email": "x@yahoo.com"})).status_code == 422
    uid = made.json()["user"]["id"]
    me = (await client.get("/api/v1/auth/me")).json()["id"]

    assert (await client.patch(f"/api/v1/admin/users/{uid}/role", json={"role": "admin"})).json()["role"] == "admin"
    assert (await client.patch(f"/api/v1/admin/users/{me}/status")).status_code == 400
    assert (await client.delete(f"/api/v1/admin/users/{me}")).status_code == 400
    assert (await client.patch(f"/api/v1/admin/users/{uid}/status")).json()["is_active"] is False
    reset = await client.post(f"/api/v1/admin/users/{uid}/reset-totp")
    assert reset.status_code == 200 and reset.json()["totp_secret"] != made.json()["totp_secret"]
    assert (await client.delete(f"/api/v1/admin/users/{uid}")).status_code == 204
    assert (await client.get("/api/v1/admin/users")).json()["total"] == 1


async def test_deactivated_user_cannot_log_in(client):
    import pyotp
    from helpers import register
    await register(client, "boss@gmail.com", "Boss")
    await _make_admin("boss@gmail.com")
    made = (await client.post("/api/v1/admin/users", json={"email": "emp@gmail.com"})).json()
    await client.patch(f"/api/v1/admin/users/{made['user']['id']}/status")
    await client.post("/api/v1/auth/logout")
    res = await client.post("/api/v1/auth/login", json={"email": "emp@gmail.com", "otp": pyotp.TOTP(made["totp_secret"]).now()})
    assert res.status_code == 403


# ---------- email verification ----------

async def test_email_verification_flow(client, monkeypatch):
    from helpers import register
    from app.services import email_verification as ev
    sent = {}

    async def fake_deliver(to, code):
        sent["code"] = code
        return True

    monkeypatch.setattr(ev, "deliver", fake_deliver)
    user, _ = await register(client, "new@gmail.com", "New", verified=False)
    assert user["email_verified"] is False
    assert (await client.put("/api/v1/connections/linkedin", json={"handle": "newperson"})).status_code == 403
    assert (await client.post("/api/v1/auto-apply/run")).status_code == 400

    assert (await client.post("/api/v1/auth/email/send")).json()["delivered"] is True
    wrong = "000000" if sent["code"] != "000000" else "111111"
    assert (await client.post("/api/v1/auth/email/verify", json={"code": wrong})).status_code == 400
    ok = await client.post("/api/v1/auth/email/verify", json={"code": sent["code"]})
    assert ok.status_code == 200 and ok.json()["email_verified"] is True
    assert (await client.get("/api/v1/auth/me")).json()["email_verified"] is True
    assert (await client.post("/api/v1/auth/email/send")).status_code == 400


# ---------- admin view notifications + announcements ----------

async def test_admin_view_is_silent_and_announcements(client):
    from helpers import register
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    admin, _ = await register(client, "boss@gmail.com", "Boss")
    await _make_admin("boss@gmail.com")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        member, _ = await register(other, "emp@gmail.com", "Emp")
        d = await client.get(f"/api/v1/admin/users/{member['id']}/details")
        assert d.status_code == 200 and d.json()["user"]["email"] == "emp@gmail.com"
        assert (await client.patch(f"/api/v1/admin/users/{member['id']}/name", json={"name": "Employee"})).json()["name"] == "Employee"
        assert (await other.get("/api/v1/notifications/mine")).json() == []
        assert "totp_secret" not in d.text and "resume_text" not in d.text
        assert (await other.post("/api/v1/notifications/announce", json={"title": "x", "message": "y"})).status_code == 403

        sent = await client.post("/api/v1/notifications/announce", json={"title": "Hello", "message": "All hands"})
        assert sent.json()["sent_to"] == 1
        inbox = (await other.get("/api/v1/notifications/mine")).json()
        note = next(n for n in inbox if n["notif_type"] == "announcement")
        await other.patch(f"/api/v1/notifications/{note['id']}/read")
        hist = (await client.get("/api/v1/notifications/announcements")).json()
        assert hist[0]["title"] == "Hello" and hist[0]["read_count"] == 1
        rec = (await client.get(f"/api/v1/notifications/announcements/{hist[0]['id']}/recipients")).json()
        assert {r["email"]: r["is_read"] for r in rec}["emp@gmail.com"] is True
        assert (await client.delete(f"/api/v1/notifications/announcements/{hist[0]['id']}")).status_code == 204
        left = (await other.get("/api/v1/notifications/mine")).json()
        assert all(n["notif_type"] != "announcement" for n in left)


async def test_announcement_opt_out_and_read_tracking(client):
    from helpers import register
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    await register(client, "boss2@gmail.com", "Boss")
    await _make_admin("boss2@gmail.com")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        u, _ = await register(other, "quiet@gmail.com", "Quiet")
        assert u["receive_announcements"] is True
        off = await other.patch("/api/v1/notifications/preferences", json={"receive_announcements": False})
        assert off.json()["receive_announcements"] is False
        await client.post("/api/v1/notifications/announce", json={"title": "T", "message": "M"})
        assert (await other.get("/api/v1/notifications/mine")).json() == []
        hist = (await client.get("/api/v1/notifications/announcements")).json()[0]
        assert hist["recipient_count"] == 0 and hist["opted_out_count"] == 1
        rec = (await client.get(f"/api/v1/notifications/announcements/{hist['id']}/recipients")).json()
        assert rec[0]["opted_out"] is True and rec[0]["read_at"] is None
        await other.patch("/api/v1/notifications/preferences", json={"receive_announcements": True})
        note = (await other.get("/api/v1/notifications/mine")).json()[0]
        await other.patch(f"/api/v1/notifications/{note['id']}/read")
        rec = (await client.get(f"/api/v1/notifications/announcements/{hist['id']}/recipients")).json()
        assert rec[0]["is_read"] is True and rec[0]["read_at"]


async def test_update_own_name(client):
    from helpers import register
    await register(client, "rename@gmail.com", "Old")
    r = await client.patch("/api/v1/auth/me", json={"name": "  New Name "})
    assert r.status_code == 200 and r.json()["name"] == "New Name"
    assert (await client.patch("/api/v1/auth/me", json={"name": " "})).status_code == 422


async def test_application_date_filter(client):
    from helpers import register
    await register(client, "dates@gmail.com", "Dates")
    assert (await client.get("/api/v1/applications?start=2999-01-01")).json() == []
    assert (await client.get("/api/v1/applications/stats?start=2999-01-01")).json()["total_applications"] == 0
    assert (await client.get("/api/v1/applications?start=2000-01-01&end=2999-01-01")).status_code == 200


async def test_live_feed_mapping(client):
    from helpers import register
    from app.services.job_feed import _to_job
    await register(client, "feed@gmail.com", "Feed")
    assert (await client.post("/api/v1/jobs/refresh")).status_code == 400  # no preferred titles yet
    job = _to_job({"id": 7, "title": "Python Developer", "redirect_url": "https://x.test/j/7", "description": "Build APIs with Python and FastAPI. Remote friendly.",
                   "company": {"display_name": "Acme"}, "location": {"display_name": "Pune"}, "contract_time": "full_time", "created": "2026-11-01T10:00:00Z"})
    assert job.external_id == "adzuna-7" and job.company == "Acme" and job.job_type == "full_time" and job.is_remote
    assert _to_job({"id": 8, "title": "No link"}) is None
    from app.services.job_feed import _arbeitnow_job, _remotive_job
    r = _remotive_job({"id": 1, "url": "https://remotive.com/j/1", "title": "Python Dev", "company_name": "R", "description": "<p>Python &amp; Django</p>", "tags": ["python"], "job_type": "full_time", "publication_date": "2026-11-13T17:29:57"})
    assert r.external_id == "remotive-1" and r.is_remote and "Source: Remotive" in r.description and "<p>" not in r.description
    a = _arbeitnow_job({"slug": "x-1", "url": "https://arbeitnow.com/x", "title": "Dev", "company_name": "A", "description": "<b>Go</b>", "job_types": ["Internship"], "created_at": 1794823276})
    assert a.external_id == "arbeitnow-x-1" and a.job_type == "internship"


# ---------- billing ----------

def test_parse_bank_alerts():
    from app.services.payment_parser import parse_alert
    a = parse_alert("Rs.1,499.14 credited to A/c XX1234 on 16-11-26 by UPI Ref No 412345678901 JP1A2B3C. Avl Bal Rs 20,000.00")
    assert a.is_credit and a.amounts_paise == [149914] and a.utr == "412345678901" and a.order_ref == "JP1A2B3C"
    assert not parse_alert("INR 499.14 debited from A/c XX1234 UPI Ref 412345678901").is_credit
    assert parse_alert("Received \u20b9499.14 from RAVI via UPI/CR/412345678901/jp1a2b3c").order_ref == "JP1A2B3C"


async def _configure(monkeypatch):
    from app.database import settings
    monkeypatch.setattr(settings, "UPI_ID", "shop@upi")
    monkeypatch.setattr(settings, "PAYMENT_WEBHOOK_SECRET", "s3cret")
    return settings


async def test_checkout_and_webhook_auto_verify(client, monkeypatch):
    from helpers import register
    settings = None
    await register(client, "boss@gmail.com", "Boss")
    from app.database import settings as cfg
    monkeypatch.setattr(cfg, "UPI_ID", "")
    assert (await client.post("/api/v1/billing/orders")).status_code == 503
    settings = await _configure(monkeypatch)
    co = (await client.post("/api/v1/billing/orders")).json()
    ref = co["order"]["order_ref"]
    assert f"tn={ref}" in co["upi_uri"] and co["qr_code"].startswith("data:image") and 0 < co["seconds_left"] <= 900
    assert co["order"]["unique_amount"] != co["order"]["base_amount"]
    assert (await client.post("/api/v1/billing/orders")).json()["order"]["id"] == co["order"]["id"]
    assert (await client.post(f"{API}/profile/pro-welcome")).json() == {"show": False}

    hook = "/api/webhooks/payment-verify"
    assert (await client.post(hook, json={"text": "x"})).status_code == 401
    hdr = {"X-Webhook-Secret": "s3cret"}
    wrong = await client.post(hook, json={"text": "Rs.199.00 credited. UPI Ref 412345678901"}, headers=hdr)
    assert wrong.json()["result"] == "UNMATCHED"
    assert (await client.post(hook, json={"text": f"Rs.{co['amount']} debited. Ref 412345678901"}, headers=hdr)).json()["result"] == "IGNORED"
    ok = await client.post(hook, json={"message": f"Rs.{co['amount']} credited to A/c XX12. UPI Ref 412345678901 {ref}"}, headers=hdr)
    assert ok.json()["matched"] is True
    assert (await client.get(f"/api/v1/billing/orders/{co['order']['id']}")).json()["status"] == "PAID"
    me = (await client.get("/api/v1/billing/me")).json()
    assert me["plan"] == "pro" and me["lifetime_limit"] is None and me["daily_limit"] == settings.PRO_DAILY_APPLY_LIMIT
    assert (await client.get(f"{API}/auth/me")).json()["pro_welcome_pending"] is True
    assert (await client.post(f"{API}/profile/pro-welcome")).json() == {"show": True}
    assert (await client.post(f"{API}/profile/pro-welcome")).json() == {"show": False}
    pdf = await client.get(f"/api/v1/billing/orders/{co['order']['id']}/invoice")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    # the same UTR cannot pay a second order
    co2 = (await client.post("/api/v1/billing/orders")).json()
    dup = await client.post(hook, content=f"Rs.{co2['amount']} credited. UPI Ref 412345678901", headers=hdr)
    assert dup.json()["result"] == "DUPLICATE"
    assert (await client.post(f"{API}/profile/pro-welcome")).json() == {"show": False}
    renewal = await client.post(hook, json={
        "message": f"Rs.{co2['amount']} credited. UPI Ref 412345678902 {co2['order']['order_ref']}",
    }, headers=hdr)
    assert renewal.json()["matched"] is True
    assert (await client.get(f"{API}/auth/me")).json()["pro_welcome_pending"] is False
    assert (await client.post(f"{API}/profile/pro-welcome")).json() == {"show": False}


async def test_admin_orders_statement_and_override(client, monkeypatch):
    from helpers import register
    await _configure(monkeypatch)
    await register(client, "boss@gmail.com", "Boss")
    co = (await client.post("/api/v1/billing/orders")).json()
    oid, paise = co["order"]["id"], co["order"]["unique_amount"]
    assert (await client.get("/api/v1/admin/orders")).status_code == 403
    await _make_admin("boss@gmail.com")
    assert (await client.get("/api/v1/admin/orders?status_filter=PENDING")).json()[0]["id"] == oid

    # Method B: UTR is only accepted once the bank statement lists it with the exact amount
    assert (await client.post(f"/api/v1/billing/orders/{oid}/utr", json={"utr": "512345678901"})).status_code == 404
    csv_text = f"Date,Narration,Ref No,Deposit Amt\n16-11-26,UPI/CR/512345678901/x,512345678901,{paise / 100:.2f}\n16-11-26,other,612345678901,10.00\n"
    up = await client.post("/api/v1/admin/bank-statement", files={"file": ("s.csv", csv_text, "text/csv")})
    assert up.json() == {"added": 2, "settled": 1}  # statement upload also settles the matching open order
    assert (await client.get(f"/api/v1/billing/orders/{oid}")).json()["status"] == "PAID"

    co2 = (await client.post("/api/v1/billing/orders")).json()
    wrong = await client.post(f"/api/v1/billing/orders/{co2['order']['id']}/utr", json={"utr": "612345678901"})
    assert wrong.status_code == 404  # amount differs
    taken = await client.post(f"/api/v1/billing/orders/{co2['order']['id']}/utr", json={"utr": "512345678901"})
    assert taken.status_code == 409
    done = await client.post(f"/api/v1/admin/orders/{co2['order']['id']}/approve")
    assert done.json()["status"] == "PAID" and done.json()["source"] == "ADMIN"
    assert (await client.post(f"/api/v1/admin/orders/{co2['order']['id']}/approve")).status_code == 409
    logs = (await client.get("/api/v1/admin/webhook-logs")).json()
    assert isinstance(logs, list)
    paid_user_id = (await client.get("/api/v1/auth/me")).json()["id"]
    await register(client, "owner@gmail.com", "Owner")
    await _make_admin("owner@gmail.com")
    assert (await client.delete(f"/api/v1/admin/users/{paid_user_id}")).status_code == 204
    assert (await client.get("/api/v1/admin/orders")).json() == []
