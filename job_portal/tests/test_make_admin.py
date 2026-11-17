"""Author: Kishore Kumar. Activated-account and TOTP guards for admin promotion."""

import time

import pyotp
import pytest
from sqlalchemy import select

from app.database import async_session_factory
from app.models import User
from tools import make_admin


@pytest.mark.parametrize("approved,active,code_kind,success", [
    (True, True, "valid", True),
    (False, True, "valid", False),
    (True, False, "valid", False),
    (True, True, "wrong", False),
    (True, True, "malformed", False),
    (True, True, "missing-secret", False),
])
async def test_promote_requires_activation_and_valid_code(client, approved, active, code_kind, success):
    secret = pyotp.random_base32()
    async with async_session_factory() as db:
        db.add(User(
            email="admin-preview@gmail.com", is_approved=approved, is_active=active,
            totp_secret=None if code_kind == "missing-secret" else secret,
        ))
        await db.commit()
    code = pyotp.TOTP(secret).now()
    if code_kind == "wrong":
        now = time.time()
        valid = {pyotp.TOTP(secret).at(now + offset) for offset in (-30, 0, 30)}
        code = next(f"{number:06d}" for number in range(10) if f"{number:06d}" not in valid)
    elif code_kind == "malformed":
        code = "abcdef"
    assert await make_admin.main(" ADMIN-PREVIEW@GMAIL.COM ", code) == (0 if success else 1)
    async with async_session_factory() as db:
        user = await db.scalar(select(User).where(User.email == "admin-preview@gmail.com"))
        assert user.role == ("admin" if success else "user")
        assert user.is_admin is success


async def test_unknown_account_is_not_created(client):
    assert await make_admin.main("missing@gmail.com", "123456") == 1
    async with async_session_factory() as db:
        assert await db.scalar(select(User).where(User.email == "missing@gmail.com")) is None


def test_interactive_command_prompts_for_hidden_code(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["createsuperuser"])
    prompts = []
    monkeypatch.setattr("builtins.input", lambda prompt: prompts.append(prompt) or "preview@gmail.com")
    monkeypatch.setattr(make_admin, "getpass", lambda prompt: prompts.append(prompt) or "123456")

    async def promote(email, code):
        assert (email, code) == ("preview@gmail.com", "123456")
        return 0

    monkeypatch.setattr(make_admin, "main", promote)
    assert make_admin.cli() == 0
    assert prompts == ["Enter Email: ", "Authenticator Code: "]
    assert "123456" not in capsys.readouterr().out
