"""Author: Kishore Kumar. WebAuthn verification and persistent single-use challenges."""

import json
from datetime import datetime, timedelta
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options, generate_registration_options, options_to_json,
    verify_authentication_response, verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticatorAttachment, AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor,
    ResidentKeyRequirement, UserVerificationRequirement,
)

from ..database import settings
from ..models import Passkey, PasskeyChallenge, User


def relying_party() -> tuple[str, str]:
    origin = (settings.WEBAUTHN_ORIGIN or settings.RENDER_EXTERNAL_URL or (
        "" if settings.COOKIE_SECURE else "http://localhost:5173"
    )).rstrip("/")
    parsed = urlsplit(origin)
    rp_id = settings.WEBAUTHN_RP_ID or parsed.hostname or ""
    local = parsed.scheme == "http" and bool(parsed.hostname) and (
        parsed.hostname == "localhost" or parsed.hostname.endswith(".localhost")
    ) and not settings.COOKIE_SECURE
    if (
        not parsed.hostname or not rp_id or parsed.username or parsed.password
        or parsed.path or parsed.query or parsed.fragment
        or (parsed.scheme != "https" and not local)
        or not (parsed.hostname == rp_id or parsed.hostname.endswith("." + rp_id))
    ):
        raise HTTPException(503, "Device sign-in is not configured for this domain. Use your authenticator code.")
    return rp_id, origin


async def _store(db: AsyncSession, options, purpose: str, user_id: int | None = None) -> dict:
    await db.execute(delete(PasskeyChallenge).where(PasskeyChallenge.expires_at <= datetime.utcnow()))
    db.add(PasskeyChallenge(
        challenge=bytes_to_base64url(options.challenge), purpose=purpose, user_id=user_id,
        expires_at=datetime.utcnow() + timedelta(minutes=5),
    ))
    await db.commit()
    return json.loads(options_to_json(options))


async def registration_options(db: AsyncSession, user: User, credentials: list[Passkey]) -> dict:
    rp_id, _ = relying_party()
    options = generate_registration_options(
        rp_id=rp_id, rp_name="JobPilot", user_id=str(user.id).encode(),
        user_name=user.email, user_display_name=user.name or user.email,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.REQUIRED, require_resident_key=True,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(key.credential_id)) for key in credentials
        ],
    )
    return await _store(db, options, "register", user.id)


async def authentication_options(db: AsyncSession) -> dict:
    rp_id, _ = relying_party()
    options = generate_authentication_options(
        rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED,
    )
    return await _store(db, options, "login")


async def consume(db: AsyncSession, challenge: str, purpose: str, user_id: int | None = None) -> bytes:
    result = await db.execute(delete(PasskeyChallenge).where(
        PasskeyChallenge.challenge == challenge, PasskeyChallenge.purpose == purpose,
        PasskeyChallenge.user_id == user_id, PasskeyChallenge.expires_at > datetime.utcnow(),
    ).returning(PasskeyChallenge.challenge))
    consumed = result.scalar_one_or_none()
    # Commit before verification so even a failed attempt cannot reuse the challenge.
    await db.commit()
    if consumed is None:
        raise HTTPException(400, "Device verification expired or was already used. Please try again.")
    return base64url_to_bytes(consumed)


def verify_registration(credential: dict, challenge: bytes):
    rp_id, origin = relying_party()
    try:
        return verify_registration_response(
            credential=credential, expected_challenge=challenge,
            expected_rp_id=rp_id, expected_origin=origin, require_user_verification=True,
        )
    except (WebAuthnException, ValueError) as exc:
        raise HTTPException(400, "Could not verify this device. Please start setup again.") from exc


def verify_authentication(credential: dict, challenge: bytes, key: Passkey):
    rp_id, origin = relying_party()
    try:
        return verify_authentication_response(
            credential=credential, expected_challenge=challenge,
            expected_rp_id=rp_id, expected_origin=origin, credential_public_key=key.public_key,
            credential_current_sign_count=key.sign_count, require_user_verification=True,
        )
    except (WebAuthnException, ValueError) as exc:
        raise HTTPException(401, "Device sign-in could not be verified. Try again or use your authenticator code.") from exc
