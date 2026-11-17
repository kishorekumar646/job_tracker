"""
Author: Kishore Kumar
Authentication routes, mounted at ``/api/v1/auth``.

    POST /auth/signup    create an inactive account, returns the authenticator QR code
    POST /auth/activate  verify the first 6-digit code and activate (then sign in)
    POST /auth/login     email + 6-digit authenticator code, sets HttpOnly cookies
    POST /auth/refresh   rotate tokens from the refresh cookie
    POST /auth/logout    revoke the session and clear cookies
    GET  /auth/me        current user
    GET  /auth/session   current user and cookie expiry timestamps (no tokens)
    PATCH /auth/me       update display name
"""

import time
import logging
import uuid
from datetime import datetime, timedelta, timezone
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth import auth_manager
from ...database import get_async_db, settings
from ...deps import get_current_user
from ...models import JobPreference, Passkey, RefreshSession, User, UserProfile
from ...services import email_verification as ev
from ...services import passkeys as pk
from ...schemas import ActivationResponse, AuthResponse, EmailCodeRequest, EmailSendResult, NameUpdate, OtpRequest, PasskeyCode, PasskeyFinish, PasskeyOut, SignupRequest, SignupResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

_ATTEMPT_LIMIT = 10
_ATTEMPT_WINDOW = 60
_attempts: dict[str, deque] = defaultdict(deque)
_REFRESH_REUSE_WINDOW = timedelta(seconds=60)


def _rate_limit(request: Request, bucket: str) -> None:
    """Sliding-window limiter per client IP and endpoint."""
    key = f"{bucket}:{request.client.host if request.client else 'unknown'}"
    now = time.monotonic()
    q = _attempts[key]
    while q and now - q[0] > _ATTEMPT_WINDOW:
        q.popleft()
    if len(q) >= _ATTEMPT_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Please wait a minute.")
    q.append(now)


def _set_cookie(response: Response, key: str, value: str, max_age: int) -> None:
    response.set_cookie(
        key=key, value=value, httponly=True, secure=settings.COOKIE_SECURE,
        samesite="lax", max_age=max_age, path="/",
    )


def _session_response(response: Response, user: User, refresh: str) -> AuthResponse:
    response.headers["Cache-Control"] = "no-store"
    access = auth_manager.create_access_token(user.id, user.role)
    refresh_payload = auth_manager.verify_token(refresh, "refresh")
    if not refresh_payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    _set_cookie(response, "access_token", access, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    _set_cookie(response, "refresh_token", refresh, max(0, refresh_payload["exp"] - int(time.time())))
    return AuthResponse(
        user=UserOut.model_validate(user),
        expires_at=auth_manager.verify_token(access)["exp"] * 1000,
        refresh_expires_at=refresh_payload["exp"] * 1000,
        server_time=int(time.time() * 1000),
    )


def _refresh_expiry(token: str) -> datetime:
    return datetime.fromtimestamp(auth_manager.verify_token(token, "refresh")["exp"], timezone.utc).replace(tzinfo=None)


async def _stored_session(db: AsyncSession, user_id: int, payload: dict) -> Optional[RefreshSession]:
    session_id = payload.get("sid", payload.get("jti"))
    if not isinstance(session_id, str):
        return None
    return await db.scalar(select(RefreshSession).where(
        RefreshSession.id == session_id, RefreshSession.user_id == user_id,
    ).execution_options(populate_existing=True))


def _valid_refresh(session: RefreshSession, token: str, now: datetime) -> bool:
    return session.expires_at > now and (
        session.refresh_token == token or (
            session.previous_refresh_token == token and session.rotated_at is not None
            and now - session.rotated_at < _REFRESH_REUSE_WINDOW
        )
    )


async def _issue_session(response: Response, user: User, db: AsyncSession) -> AuthResponse:
    session_id = uuid.uuid4().hex
    refresh = auth_manager.create_refresh_token(user.id, session_id)
    await db.execute(delete(RefreshSession).where(
        RefreshSession.user_id == user.id, RefreshSession.expires_at <= datetime.utcnow(),
    ))
    db.add(RefreshSession(
        id=session_id, user_id=user.id, refresh_token=refresh, expires_at=_refresh_expiry(refresh),
    ))
    await db.commit()
    return _session_response(response, user, refresh)


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, request: Request, db: AsyncSession = Depends(get_async_db)):
    _rate_limit(request, "signup")
    email = body.email.lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user and user.is_approved:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Please sign in.")

    # A never-activated account is re-issued a fresh secret so it can't be squatted.
    secret = auth_manager.new_totp_secret()
    if user is None:
        user = User(email=email, is_approved=False)
        user.profile = UserProfile(skills=[])
        user.preferences = JobPreference(job_titles=[], locations=[], job_types=[])
        db.add(user)
    user.name = body.full_name
    user.date_of_birth = body.date_of_birth.isoformat()
    user.totp_secret = secret
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Please sign in.")

    uri = auth_manager.provisioning_uri(email, secret)
    return SignupResponse(
        message="Scan the QR code with your authenticator app, then enter the 6-digit code to activate.",
        email=email, totp_secret=secret, otpauth_url=uri, qr_code=auth_manager.qr_data_uri(uri),
    )


@router.post("/activate", response_model=ActivationResponse)
async def activate(body: OtpRequest, request: Request, db: AsyncSession = Depends(get_async_db)):
    _rate_limit(request, "activate")
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or user.is_approved or not auth_manager.verify_totp(user.totp_secret, body.otp):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired code")
    user.is_approved = True
    await db.commit()
    return ActivationResponse(message="Account activated. You can now sign in.", user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(
    body: OtpRequest, request: Request, response: Response, db: AsyncSession = Depends(get_async_db)
):
    _rate_limit(request, "login")
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_approved or not auth_manager.verify_totp(user.totp_secret, body.otp):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or authenticator code")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    return await _issue_session(response, user, db)


def _confirm_device_change(user: User, body: PasskeyCode, request: Request) -> None:
    _rate_limit(request, "passkey-change")
    if not user.is_approved:
        raise HTTPException(403, "Activate your account first")
    if not auth_manager.verify_totp(user.totp_secret, body.otp):
        raise HTTPException(400, "Invalid authenticator code")


@router.get("/passkeys", response_model=list[PasskeyOut])
async def list_passkeys(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    return (await db.scalars(select(Passkey).where(Passkey.user_id == user.id).order_by(Passkey.id))).all()


@router.post("/passkeys/register/options")
async def passkey_register_options(
    body: PasskeyCode, request: Request,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db),
):
    _confirm_device_change(user, body, request)
    keys = list((await db.scalars(select(Passkey).where(Passkey.user_id == user.id))).all())
    return await pk.registration_options(db, user, keys)


@router.post("/passkeys/register/verify", response_model=PasskeyOut)
async def passkey_register_verify(
    body: PasskeyFinish, request: Request,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db),
):
    _rate_limit(request, "passkey-register")
    challenge = await pk.consume(db, body.challenge, "register", user.id)
    result = pk.verify_registration(body.credential, challenge)
    key = Passkey(
        user_id=user.id, name=body.name.strip() or "My device",
        credential_id=pk.bytes_to_base64url(result.credential_id),
        public_key=result.credential_public_key, sign_count=result.sign_count,
    )
    db.add(key)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This device is already registered")
    return key


@router.delete("/passkeys/{key_id}", status_code=204)
async def remove_passkey(
    key_id: int, body: PasskeyCode, request: Request,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db),
):
    _confirm_device_change(user, body, request)
    result = await db.execute(delete(Passkey).where(Passkey.id == key_id, Passkey.user_id == user.id))
    if not result.rowcount:
        raise HTTPException(404, "Device not found")
    await db.commit()


@router.post("/passkeys/login/options")
async def passkey_login_options(request: Request, db: AsyncSession = Depends(get_async_db)):
    _rate_limit(request, "passkey-login-options")
    return await pk.authentication_options(db)


@router.post("/passkeys/login/verify", response_model=AuthResponse)
async def passkey_login_verify(
    body: PasskeyFinish, request: Request, response: Response, db: AsyncSession = Depends(get_async_db),
):
    _rate_limit(request, "passkey-login")
    challenge = await pk.consume(db, body.challenge, "login")
    credential_id = body.credential.get("id")
    key = await db.scalar(select(Passkey).where(Passkey.credential_id == credential_id)) if isinstance(credential_id, str) else None
    user = await db.get(User, key.user_id) if key else None
    if not key or not user or not user.is_active or not user.is_approved:
        raise HTTPException(401, "Device sign-in is unavailable. Use your authenticator code.")
    credential_response = body.credential.get("response")
    if not isinstance(credential_response, dict) or credential_response.get("userHandle") != pk.bytes_to_base64url(str(user.id).encode()):
        raise HTTPException(401, "Device sign-in could not be verified")
    result = pk.verify_authentication(body.credential, challenge, key)
    changed = await db.execute(update(Passkey).where(
        Passkey.id == key.id, Passkey.sign_count == key.sign_count,
    ).values(sign_count=result.new_sign_count))
    if not changed.rowcount:
        raise HTTPException(401, "Device sign-in changed. Please try again.")
    return await _issue_session(response, user, db)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_async_db),
):
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    payload = auth_manager.verify_token(refresh_token, "refresh")
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = await db.scalar(select(User).where(User.id == int(payload["sub"])))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session no longer valid")
    now = datetime.utcnow()
    session = await _stored_session(db, user.id, payload)
    if session is None and "sid" not in payload and isinstance(payload.get("jti"), str):
        # Atomically adopt a pre-upgrade cookie without requiring another sign-in.
        adopted = await db.execute(update(User).where(
            User.id == user.id, User.refresh_token == refresh_token,
        ).values(refresh_token=None))
        if adopted.rowcount:
            session = RefreshSession(
                id=payload["jti"], user_id=user.id, refresh_token=refresh_token,
                expires_at=_refresh_expiry(refresh_token),
            )
            db.add(session)
            await db.flush()
        else:
            session = await _stored_session(db, user.id, payload)
    if session is None or not _valid_refresh(session, refresh_token, now):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session no longer valid")

    # A rotation is shared briefly by concurrent requests/tabs, not repeated by each.
    if session.rotated_at is None or now - session.rotated_at >= _REFRESH_REUSE_WINDOW:
        replacement = auth_manager.create_refresh_token(user.id, session.id)
        await db.execute(update(RefreshSession).where(
            RefreshSession.id == session.id, RefreshSession.refresh_token == session.refresh_token,
        ).values(
            previous_refresh_token=session.refresh_token, refresh_token=replacement,
            rotated_at=now, expires_at=_refresh_expiry(replacement),
        ).execution_options(synchronize_session=False))
        session = await _stored_session(db, user.id, payload)
        if session is None or not _valid_refresh(session, refresh_token, now):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session no longer valid")
    await db.commit()
    return _session_response(response, user, session.refresh_token)


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_async_db),
):
    if refresh_token:
        payload = auth_manager.verify_token(refresh_token, "refresh")
        if payload:
            user = await db.scalar(select(User).where(User.id == int(payload["sub"])))
            if user:
                session = await _stored_session(db, user.id, payload)
                if session and _valid_refresh(session, refresh_token, datetime.utcnow()):
                    await db.delete(session)
                if user.refresh_token == refresh_token:
                    user.refresh_token = None
                await db.commit()
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.get("/session", response_model=AuthResponse)
async def session_info(
    request: Request, response: Response, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    token = request.cookies.get("access_token")
    if not token:
        token = request.headers.get("authorization", "")[7:].strip()
    payload = auth_manager.verify_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Please sign in again.")
    refresh_token = request.cookies.get("refresh_token")
    refresh_payload = auth_manager.verify_token(refresh_token, "refresh") if refresh_token else None
    if refresh_payload:
        session = await _stored_session(db, user.id, refresh_payload)
        if not (session and _valid_refresh(session, refresh_token, datetime.utcnow())) and refresh_token != user.refresh_token:
            refresh_payload = None
    response.headers["Cache-Control"] = "no-store"
    return AuthResponse(
        user=UserOut.model_validate(user), expires_at=payload["exp"] * 1000,
        refresh_expires_at=refresh_payload["exp"] * 1000 if refresh_payload else None,
        server_time=int(time.time() * 1000),
    )


@router.patch("/me", response_model=UserOut)
async def update_me(body: NameUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty.")
    user.name = name
    await db.commit()
    return UserOut.model_validate(user)


@router.post("/email/send", response_model=EmailSendResult)
async def send_email_code(request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    _rate_limit(request, "email-send")
    if user.email_verified:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your email is already verified")
    code = ev.new_code()
    user.email_code_hash = ev.hash_code(code)
    user.email_code_expires = ev.expiry()
    user.email_code_attempts = 0
    await db.commit()
    try:
        delivered = await ev.deliver(user.email, code)
    except ev.EmailDeliveryError:
        logging.getLogger("job_portal").exception("Verification email delivery failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the email. Please try again later.")
    msg = (
        f"We sent a 6-digit code to {user.email}."
        if delivered
        else "Email delivery isn't configured on this server; the code was written to the backend log."
    )
    return EmailSendResult(message=msg, delivered=delivered)


@router.post("/email/verify", response_model=UserOut)
async def verify_email_code(
    body: EmailCodeRequest, request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    _rate_limit(request, "email-verify")
    if user.email_verified:
        return UserOut.model_validate(user)
    if not user.email_code_hash or not user.email_code_expires or user.email_code_expires < datetime.utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code expired. Request a new one.")
    if user.email_code_attempts >= ev.MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Request a new code.")
    user.email_code_attempts += 1
    if not ev.codes_match(user.email_code_hash, body.code):
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code")
    user.email_verified = True
    user.email_code_hash = None
    user.email_code_expires = None
    await db.commit()
    return UserOut.model_validate(user)
