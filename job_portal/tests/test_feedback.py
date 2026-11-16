"""Author: Kishore Kumar. Feedback persistence, access control and review workflow."""

import pytest
from sqlalchemy import select, update

from app.database import async_session_factory
from app.models import Feedback, User
from helpers import register

API = "/api/v1"


async def test_feedback_requires_login_and_admin_review_permissions(client):
    assert (await client.post(f"{API}/feedback", json={"rating": 5})).status_code == 401
    await register(client)
    assert (await client.get(f"{API}/admin/feedback")).status_code == 403
    assert (await client.patch(f"{API}/admin/feedback/1", json={"status": "reviewed"})).status_code == 403


async def test_feedback_is_saved_and_admin_can_filter_paginate_and_review(client):
    user, _ = await register(client)
    first = await client.post(f"{API}/feedback", json={"rating": 4, "comment": "  Helpful tracker\nThanks!  ", "page": "/jobs", "user_id": 999})
    assert first.status_code == 201
    assert first.json()["comment"] == "Helpful tracker\nThanks!"
    assert first.json()["status"] == "new"
    second = await client.post(f"{API}/feedback", json={"rating": 2})
    assert second.status_code == 201 and second.json()["comment"] == ""
    async with async_session_factory() as db:
        stored = await db.get(Feedback, first.json()["id"])
        assert stored.user_id == user["id"]
        await db.execute(update(User).where(User.id == user["id"]).values(role="admin"))
        await db.commit()
    listing = (await client.get(f"{API}/admin/feedback", params={"limit": 1})).json()
    assert listing["total"] == 2 and len(listing["items"]) == 1
    assert listing["items"][0]["id"] == second.json()["id"]
    assert listing["items"][0]["user_email"] == user["email"]
    older = (await client.get(f"{API}/admin/feedback", params={"limit": 1, "skip": 1})).json()["items"][0]
    assert older["id"] == first.json()["id"] and older["page"] == "/jobs"
    reviewed = await client.patch(f"{API}/admin/feedback/{older['id']}", json={"status": "reviewed"})
    assert reviewed.status_code == 200 and reviewed.json()["status"] == "reviewed"
    for status, expected in [("new", second.json()["id"]), ("reviewed", older["id"])]:
        filtered = (await client.get(f"{API}/admin/feedback", params={"status_filter": status})).json()
        assert filtered["total"] == 1 and filtered["items"][0]["id"] == expected
    assert (await client.patch(f"{API}/admin/feedback/999999", json={"status": "reviewed"})).status_code == 404
    assert (await client.patch(f"{API}/admin/feedback/{older['id']}", json={"status": "invalid"})).status_code == 422
    assert (await client.get(f"{API}/admin/feedback", params={"limit": 101})).status_code == 422


@pytest.mark.parametrize("body", [
    {"rating": 0}, {"rating": 6}, {"rating": 2.5}, {"rating": True},
    {"rating": 5, "comment": "x" * 2001}, {"rating": 5, "page": "/jobs?private=hidden"},
])
async def test_invalid_feedback_is_not_saved(client, body):
    await register(client)
    assert (await client.post(f"{API}/feedback", json=body)).status_code == 422
    async with async_session_factory() as db:
        assert await db.scalar(select(Feedback.id)) is None


async def test_deleting_a_user_also_removes_feedback(client):
    user, _ = await register(client)
    assert (await client.post(f"{API}/feedback", json={"rating": 3, "comment": "Test"})).status_code == 201
    admin, _ = await register(client, email="feedback-admin@gmail.com")
    async with async_session_factory() as db:
        await db.execute(update(User).where(User.id == admin["id"]).values(role="admin"))
        await db.commit()
    assert (await client.delete(f"{API}/admin/users/{user['id']}")).status_code == 204
    assert (await client.get(f"{API}/admin/feedback")).json() == {"items": [], "total": 0}
