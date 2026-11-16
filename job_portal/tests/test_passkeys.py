"""Author: Kishore Kumar. Real WebAuthn signatures, replay protection and guide limits."""

import hashlib
import json
import secrets
from datetime import datetime, timedelta

import cbor2
import pyotp
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select, update
from webauthn.helpers import bytes_to_base64url as b64

from app.database import async_session_factory, settings
from app.models import Passkey, PasskeyChallenge, User
from helpers import register

API = "/api/v1"
RP = "jobs.example.com"
ORIGIN = "https://jobs.example.com"


@pytest.fixture(autouse=True)
def passkey_config(monkeypatch):
    monkeypatch.setattr(settings, "WEBAUTHN_ORIGIN", ORIGIN)
    monkeypatch.setattr(settings, "WEBAUTHN_RP_ID", RP)


def _client_data(challenge, kind, origin=ORIGIN):
    return json.dumps({"type": kind, "challenge": challenge, "origin": origin, "crossOrigin": False}).encode()


def _registration(challenge, private, credential_id, *, origin=ORIGIN, rp=RP, flags=0x45):
    numbers = private.public_key().public_numbers()
    public = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: numbers.x.to_bytes(32, "big"), -3: numbers.y.to_bytes(32, "big")})
    auth_data = hashlib.sha256(rp.encode()).digest() + bytes([flags]) + bytes(4)
    auth_data += bytes(16) + len(credential_id).to_bytes(2, "big") + credential_id + public
    attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
    return {
        "id": b64(credential_id), "rawId": b64(credential_id), "type": "public-key",
        "response": {
            "clientDataJSON": b64(_client_data(challenge, "webauthn.create", origin)),
            "attestationObject": b64(attestation), "transports": ["internal"],
        },
    }


def _assertion(challenge, private, credential_id, user_id, *, origin=ORIGIN, rp=RP, flags=5, counter=1):
    client_data = _client_data(challenge, "webauthn.get", origin)
    auth_data = hashlib.sha256(rp.encode()).digest() + bytes([flags]) + counter.to_bytes(4, "big")
    signature = private.sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
    return {
        "id": b64(credential_id), "rawId": b64(credential_id), "type": "public-key",
        "response": {
            "clientDataJSON": b64(client_data), "authenticatorData": b64(auth_data),
            "signature": b64(signature), "userHandle": b64(str(user_id).encode()),
        },
    }


async def _options(client, secret):
    response = await client.post(f"{API}/auth/passkeys/register/options", json={"otp": pyotp.TOTP(secret).now()})
    assert response.status_code == 200, response.text
    return response.json()


async def _enroll(client):
    user, secret = await register(client)
    options = await _options(client, secret)
    assert options["authenticatorSelection"]["userVerification"] == "required"
    assert options["authenticatorSelection"]["residentKey"] == "required"
    private, credential_id = ec.generate_private_key(ec.SECP256R1()), secrets.token_bytes(32)
    response = await client.post(f"{API}/auth/passkeys/register/verify", json={
        "challenge": options["challenge"], "credential": _registration(options["challenge"], private, credential_id),
        "name": "My test phone",
    })
    assert response.status_code == 200, response.text
    return user, secret, private, credential_id, response.json()


async def test_real_passkey_login_replay_and_removal(client):
    user, secret, private, credential_id, key = await _enroll(client)
    listing = (await client.get(f"{API}/auth/passkeys")).json()
    assert listing == [key] and "public_key" not in listing[0]
    await client.post(f"{API}/auth/logout")
    options = (await client.post(f"{API}/auth/passkeys/login/options")).json()
    assert options["userVerification"] == "required"
    payload = {"challenge": options["challenge"], "credential": _assertion(options["challenge"], private, credential_id, user["id"])}
    response = await client.post(f"{API}/auth/passkeys/login/verify", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["user"]["id"] == user["id"]
    assert response.json()["expires_at"] < response.json()["refresh_expires_at"]
    assert response.headers["cache-control"] == "no-store"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert (await client.post(f"{API}/auth/passkeys/login/verify", json=payload)).status_code == 400
    async with async_session_factory() as db:
        assert await db.scalar(select(Passkey.sign_count).where(Passkey.id == key["id"])) == 1
    removed = await client.request("DELETE", f"{API}/auth/passkeys/{key['id']}", json={"otp": pyotp.TOTP(secret).now()})
    assert removed.status_code == 204
    options = (await client.post(f"{API}/auth/passkeys/login/options")).json()
    assert (await client.post(f"{API}/auth/passkeys/login/verify", json={
        "challenge": options["challenge"], "credential": _assertion(options["challenge"], private, credential_id, user["id"], counter=2),
    })).status_code == 401


@pytest.mark.parametrize("change", [{"origin": "https://attacker.example"}, {"rp": "attacker.example"}, {"flags": 0x41}])
async def test_registration_requires_correct_origin_rp_and_user_verification(client, change):
    _, secret = await register(client)
    options = await _options(client, secret)
    credential = _registration(options["challenge"], ec.generate_private_key(ec.SECP256R1()), secrets.token_bytes(32), **change)
    response = await client.post(f"{API}/auth/passkeys/register/verify", json={"challenge": options["challenge"], "credential": credential})
    assert response.status_code == 400
    assert (await client.get(f"{API}/auth/passkeys")).json() == []
    assert (await client.post(f"{API}/auth/passkeys/register/verify", json={"challenge": options["challenge"], "credential": credential})).status_code == 400


@pytest.mark.parametrize("case", ["origin", "rp", "verification", "signature", "counter", "handle", "inactive"])
async def test_login_rejects_invalid_authenticator_assertions(client, case):
    user, _, private, credential_id, key = await _enroll(client)
    async with async_session_factory() as db:
        await db.execute(update(Passkey).where(Passkey.id == key["id"]).values(sign_count=2))
        if case == "inactive":
            await db.execute(update(User).where(User.id == user["id"]).values(is_active=False))
        await db.commit()
    options = (await client.post(f"{API}/auth/passkeys/login/options")).json()
    kwargs = {"counter": 3}
    if case == "origin": kwargs["origin"] = "https://attacker.example"
    if case == "rp": kwargs["rp"] = "attacker.example"
    if case == "verification": kwargs["flags"] = 1
    if case == "counter": kwargs["counter"] = 1
    credential = _assertion(options["challenge"], private, credential_id, user["id"], **kwargs)
    if case == "signature": credential["response"]["signature"] = b64(b"bad-signature")
    if case == "handle": credential["response"]["userHandle"] = b64(b"another-user")
    client.cookies.clear()
    result = await client.post(f"{API}/auth/passkeys/login/verify", json={"challenge": options["challenge"], "credential": credential})
    assert result.status_code == 401, result.text
    assert not result.cookies and not client.cookies
    async with async_session_factory() as db:
        assert await db.scalar(select(Passkey.sign_count).where(Passkey.id == key["id"])) == 2


async def test_enrollment_and_removal_require_totp_and_ownership(client):
    user, secret, _, _, key = await _enroll(client)
    incorrect = "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"
    assert (await client.post(f"{API}/auth/passkeys/register/options", json={"otp": incorrect})).status_code == 400
    assert (await client.request("DELETE", f"{API}/auth/passkeys/{key['id']}", json={"otp": incorrect})).status_code == 400
    _, second_secret = await register(client, email="second@gmail.com")
    assert (await client.get(f"{API}/auth/passkeys")).json() == []
    assert (await client.request("DELETE", f"{API}/auth/passkeys/{key['id']}", json={"otp": pyotp.TOTP(second_secret).now()})).status_code == 404
    await client.post(f"{API}/auth/login", json={"email": user["email"], "otp": pyotp.TOTP(secret).now()})
    assert len((await client.get(f"{API}/auth/passkeys")).json()) == 1


async def test_challenges_expire_and_cannot_cross_ceremonies(client):
    _, secret = await register(client)
    registration = await _options(client, secret)
    invalid_login = {"challenge": registration["challenge"], "credential": {}}
    assert (await client.post(f"{API}/auth/passkeys/login/verify", json=invalid_login)).status_code == 400
    options = (await client.post(f"{API}/auth/passkeys/login/options")).json()
    async with async_session_factory() as db:
        await db.execute(update(PasskeyChallenge).where(PasskeyChallenge.challenge == options["challenge"]).values(expires_at=datetime.utcnow() - timedelta(seconds=1)))
        await db.commit()
    assert (await client.post(f"{API}/auth/passkeys/login/verify", json={"challenge": options["challenge"], "credential": {}})).status_code == 400
    client.cookies.clear()
    assert (await client.get(f"{API}/auth/passkeys")).status_code == 401
    assert (await client.post(f"{API}/auth/passkeys/register/options", json={"otp": pyotp.TOTP(secret).now()})).status_code == 401


@pytest.mark.parametrize("operation", ["reset-totp", "delete"])
async def test_account_recovery_and_deletion_revoke_device_credentials(client, operation):
    user, secret, private, credential_id, _ = await _enroll(client)
    pending = await _options(client, secret)
    admin, _ = await register(client, email="device-admin@gmail.com")
    async with async_session_factory() as db:
        await db.execute(update(User).where(User.id == admin["id"]).values(role="admin"))
        await db.commit()
    if operation == "reset-totp":
        response = await client.post(f"{API}/admin/users/{user['id']}/reset-totp")
        assert response.status_code == 200, response.text
        replacement_secret = response.json()["totp_secret"]
    else:
        response = await client.delete(f"{API}/admin/users/{user['id']}")
        assert response.status_code == 204, response.text
    async with async_session_factory() as db:
        assert await db.scalar(select(Passkey.id).where(Passkey.user_id == user["id"])) is None
        assert await db.get(PasskeyChallenge, pending["challenge"]) is None
        if operation == "delete":
            assert await db.get(User, user["id"]) is None
    await client.post(f"{API}/auth/logout")
    options = (await client.post(f"{API}/auth/passkeys/login/options")).json()
    assert (await client.post(f"{API}/auth/passkeys/login/verify", json={
        "challenge": options["challenge"],
        "credential": _assertion(options["challenge"], private, credential_id, user["id"]),
    })).status_code == 401
    if operation == "reset-totp":
        login = await client.post(f"{API}/auth/login", json={"email": user["email"], "otp": pyotp.TOTP(replacement_secret).now()})
        assert login.status_code == 200
        assert (await client.get(f"{API}/auth/passkeys")).json() == []


async def test_secure_hosting_requires_an_explicit_trusted_origin(client, monkeypatch):
    monkeypatch.setattr(settings, "WEBAUTHN_ORIGIN", "")
    monkeypatch.setattr(settings, "WEBAUTHN_RP_ID", "")
    monkeypatch.setattr(settings, "RENDER_EXTERNAL_URL", "")
    monkeypatch.setattr(settings, "COOKIE_SECURE", True)
    assert (await client.post(f"{API}/auth/passkeys/login/options", headers={"Host": "attacker.example"})).status_code == 503
    monkeypatch.setattr(settings, "RENDER_EXTERNAL_URL", "https://jobpilot.onrender.com")
    assert (await client.post(f"{API}/auth/passkeys/login/options")).json()["rpId"] == "jobpilot.onrender.com"


async def test_guide_auto_display_is_limited_per_account(client):
    await register(client)
    claims = [(await client.post(f"{API}/profile/guide")).json() for _ in range(3)]
    assert claims == [{"show": True, "shown": 1}, {"show": True, "shown": 2}, {"show": False, "shown": 2}]
    await register(client, email="other-guide@gmail.com")
    assert (await client.post(f"{API}/profile/guide")).json() == {"show": True, "shown": 1}
