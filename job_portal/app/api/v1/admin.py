"""
Author: Kishore Kumar
Admin user management, mounted at ``/api/v1/admin`` (admins only).

    GET    /admin/users                   list users with activity counts
    POST   /admin/users                   create an activated user, returns the authenticator QR
    PATCH  /admin/users/{id}/role         promote / demote
    POST   /admin/users/{id}/pro          grant / extend Pro without a payment
    DELETE /admin/users/{id}/pro          remove current Pro access, keeping billing history
    PATCH  /admin/users/{id}/status       activate / deactivate (toggle)
    POST   /admin/users/{id}/reset-totp   issue a new authenticator secret and QR
    PATCH  /admin/users/{id}/name         edit the display name
    GET    /admin/users/{id}/details      read-only profile summary (no secrets)
    DELETE /admin/users/{id}              delete the user and all their data
    GET    /admin/orders                  orders (?status=PENDING|PAID|EXPIRED|FAILED)
    POST   /admin/orders/{id}/approve     manual override: mark paid
    POST   /admin/orders/{id}/fail        mark failed
    GET    /admin/webhook-logs            bank alert log (?result=UNMATCHED ...)
    POST   /admin/bank-statement          upload CSV; verifies UTRs and settles matching open orders
"""

import csv
import io
import logging
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth import auth_manager
from ...database import get_async_db, settings
from ...deps import require_admin
from ...models import BankEntry, WebhookLog, Application, AutoApplyRun, Feedback, Job, JobPreference, Notification, Order, Passkey, PasskeyChallenge, Subscription, Transaction, SocialAccount, User, UserProfile
from ...schemas import AdminCreateUser, AdminNameUpdate, AdminRoleUpdate, AdminTotpResult, AdminUserDetail, AdminUserList, AdminUserOut, AdminOrderOut, WebhookLogOut
from ...schemas import AdminFeedbackOut, FeedbackList, FeedbackOut, FeedbackUpdate
from ...services.billing import expire_old, mark_paid, pending_by_amount
from ...services.payment_parser import to_paise
from ...services.plans import effective_plan, grant_pro

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


@router.get("/feedback", response_model=FeedbackList)
async def list_feedback(
    status_filter: Literal["new", "reviewed"] | None = None,
    skip: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
):
    query = select(Feedback, User.email, User.name).join(User, User.id == Feedback.user_id)
    count = select(func.count()).select_from(Feedback)
    if status_filter:
        query = query.where(Feedback.status == status_filter)
        count = count.where(Feedback.status == status_filter)
    rows = (await db.execute(query.order_by(Feedback.created_at.desc(), Feedback.id.desc()).offset(skip).limit(limit))).all()
    return FeedbackList(
        items=[AdminFeedbackOut(
            **FeedbackOut.model_validate(item).model_dump(), user_email=email, user_name=name,
        ) for item, email, name in rows],
        total=await db.scalar(count),
    )


@router.patch("/feedback/{feedback_id}", response_model=FeedbackOut)
async def review_feedback(feedback_id: int, body: FeedbackUpdate, db: AsyncSession = Depends(get_async_db)):
    feedback = await db.get(Feedback, feedback_id)
    if not feedback:
        raise HTTPException(404, "Feedback not found")
    feedback.status = body.status
    await db.commit()
    return feedback


async def _counts(db: AsyncSession, user_id: int) -> tuple[int, int]:
    apps = await db.scalar(select(func.count()).select_from(Application).where(Application.user_id == user_id))
    conns = await db.scalar(select(func.count()).select_from(SocialAccount).where(SocialAccount.user_id == user_id))
    return apps or 0, conns or 0


async def _out(db: AsyncSession, user: User) -> AdminUserOut:
    apps, conns = await _counts(db, user.id)
    plan = effective_plan(user)
    return AdminUserOut(
        id=user.id, email=user.email, name=user.name, role=user.role, is_active=user.is_active,
        is_approved=user.is_approved, date_of_birth=user.date_of_birth, email_verified=user.email_verified,
        last_seen=user.last_seen, created_at=user.created_at, applications=apps, connections=conns,
        plan=plan, plan_expires_at=user.plan_expires_at if plan == "pro" else None,
    )


async def _get(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _not_self(admin: User, user: User, what: str) -> None:
    if admin.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You cannot {what} your own account")


@router.get("/users", response_model=AdminUserList)
async def list_users(db: AsyncSession = Depends(get_async_db)):
    users = (await db.scalars(select(User).order_by(User.created_at.desc()))).all()
    items = [await _out(db, u) for u in users]
    return AdminUserList(users=items, total=len(items), pending=sum(1 for u in users if not u.is_approved), pro_days=settings.PRO_DAYS)


@router.post("/users", response_model=AdminTotpResult, status_code=status.HTTP_201_CREATED)
async def create_user(body: AdminCreateUser, db: AsyncSession = Depends(get_async_db)):
    if await db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")
    secret = auth_manager.new_totp_secret()
    user = User(email=body.email, name=body.name, role=body.role, is_approved=True, totp_secret=secret)
    user.profile = UserProfile(skills=[])
    user.preferences = JobPreference(job_titles=[], locations=[], job_types=[])
    db.add(user)
    await db.commit()
    uri = auth_manager.provisioning_uri(user.email, secret)
    return AdminTotpResult(
        user=await _out(db, user), totp_secret=secret, qr_code=auth_manager.qr_data_uri(uri),
        message="User created. Share the QR code so they can add it to their authenticator app.",
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
async def set_role(user_id: int, body: AdminRoleUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    _not_self(admin, user, "change the role of")
    user.role = body.role
    db.add(Notification(
        user_id=user.id, notif_type="role_change", title="Your role changed",
        message=f"An admin changed your role to {'Admin' if body.role == 'admin' else 'Member'}.",
    ))
    await db.commit()
    return await _out(db, user)


@router.patch("/users/{user_id}/status", response_model=AdminUserOut)
async def toggle_status(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    _not_self(admin, user, "deactivate")
    user.is_active = not user.is_active
    if not user.is_active:
        user.refresh_token = None
    await db.commit()
    return await _out(db, user)


@router.post("/users/{user_id}/pro", response_model=AdminUserOut)
async def grant_user_pro(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    start = user.plan_expires_at if effective_plan(user) == "pro" else datetime.utcnow()
    grant_pro(user)
    db.add(Subscription(
        user_id=user.id, order_id=None, plan_id="pro", status="ACTIVE",
        start_date=start, end_date=user.plan_expires_at,
    ))
    db.add(Notification(
        user_id=user.id, notif_type="billing", title="Pro access granted",
        message=f"An admin granted you {settings.PRO_DAYS} days of Pro. Your Pro access is valid until {user.plan_expires_at:%d %b %Y}.",
    ))
    await db.commit()
    logger.info("Admin %s granted %s days of Pro to user %s, valid until %s", admin.id, settings.PRO_DAYS, user.id, user.plan_expires_at)
    return await _out(db, user)


@router.delete("/users/{user_id}/pro", response_model=AdminUserOut)
async def revoke_user_pro(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    if effective_plan(user) != "pro":
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is already on the Free plan")
    user.plan, user.plan_expires_at = "free", None
    await db.execute(
        update(Subscription).where(
            Subscription.user_id == user.id, Subscription.plan_id == "pro", Subscription.status == "ACTIVE",
        ).values(status="CANCELLED")
    )
    db.add(Notification(
        user_id=user.id, notif_type="billing", title="Pro access removed",
        message="An admin removed your Pro access. Your account is now on the Free plan. Previous auto-apply usage still counts toward the Free limit. No payment has been refunded.",
    ))
    await db.commit()
    logger.info("Admin %s removed Pro access from user %s", admin.id, user.id)
    return await _out(db, user)


@router.patch("/users/{user_id}/name", response_model=AdminUserOut)
async def set_name(user_id: int, body: AdminNameUpdate, db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    user.name = (body.name or "").strip() or None
    await db.commit()
    return await _out(db, user)


@router.get("/users/{user_id}/details", response_model=AdminUserDetail)
async def user_details(user_id: int, db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user.id))
    platforms = (await db.scalars(select(SocialAccount.platform).where(SocialAccount.user_id == user.id))).all()
    rows = (await db.execute(
        select(Application.status, func.count()).where(Application.user_id == user.id).group_by(Application.status)
    )).all()
    return AdminUserDetail(
        user=await _out(db, user),
        headline=profile.headline if profile else None,
        location=profile.location if profile else None,
        experience_years=profile.experience_years if profile else None,
        skills=list(profile.skills or []) if profile else [],
        resume_filename=profile.resume_filename if profile else None,
        job_titles=list(prefs.job_titles or []) if prefs else [],
        locations=list(prefs.locations or []) if prefs else [],
        auto_apply_enabled=bool(prefs and prefs.auto_apply_enabled),
        platforms=list(platforms),
        status_counts={k: v for k, v in rows},
    )


@router.post("/users/{user_id}/reset-totp", response_model=AdminTotpResult)
async def reset_totp(user_id: int, db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    user.totp_secret = auth_manager.new_totp_secret()
    user.refresh_token = None
    await db.execute(delete(Passkey).where(Passkey.user_id == user.id))
    await db.execute(delete(PasskeyChallenge).where(PasskeyChallenge.user_id == user.id))
    await db.commit()
    uri = auth_manager.provisioning_uri(user.email, user.totp_secret)
    return AdminTotpResult(
        user=await _out(db, user), totp_secret=user.totp_secret, qr_code=auth_manager.qr_data_uri(uri),
        message="Authenticator reset and device passkeys revoked. The user must scan this new QR code.",
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_async_db)):
    user = await _get(db, user_id)
    _not_self(admin, user, "delete")
    await db.execute(delete(AutoApplyRun).where(AutoApplyRun.user_id == user.id))
    order_ids = select(Order.id).where(Order.user_id == user.id)
    await db.execute(delete(Transaction).where(Transaction.order_id.in_(order_ids)))
    await db.execute(delete(Subscription).where(Subscription.user_id == user.id))
    await db.execute(delete(Order).where(Order.user_id == user.id))
    for job in (await db.scalars(select(Job).where(Job.owner_id == user.id))).all():
        await db.delete(job)
    await db.flush()
    await db.delete(user)
    await db.commit()


async def _order_out(db: AsyncSession, order: Order) -> AdminOrderOut:
    user = await db.get(User, order.user_id)
    tx = await db.scalar(select(Transaction).where(Transaction.order_id == order.id))
    return AdminOrderOut(
        **{k: getattr(order, k) for k in ("id", "order_ref", "plan_id", "base_amount", "unique_amount", "status", "expires_at", "paid_at", "created_at", "invoice_no")},
        user_email=user.email, user_name=user.name, utr=tx.utr_number if tx else None, source=tx.verification_source if tx else None,
    )


@router.get("/orders", response_model=list[AdminOrderOut])
async def list_orders(status_filter: str | None = None, db: AsyncSession = Depends(get_async_db)):
    await expire_old(db)
    await db.commit()
    q = select(Order).order_by(Order.id.desc()).limit(200)
    if status_filter:
        q = q.where(Order.status == status_filter.upper())
    return [await _order_out(db, o) for o in (await db.scalars(q)).all()]


async def _order(db: AsyncSession, order_id: int) -> Order:
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.post("/orders/{order_id}/approve", response_model=AdminOrderOut)
async def approve_order(order_id: int, db: AsyncSession = Depends(get_async_db)):
    order = await _order(db, order_id)
    if order.status == "PAID":
        raise HTTPException(status.HTTP_409_CONFLICT, "Order is already paid")
    if not await mark_paid(db, order, utr=None, raw="Approved by admin", source="ADMIN"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not approve this order")
    await db.refresh(order)
    return await _order_out(db, order)


@router.post("/orders/{order_id}/fail", response_model=AdminOrderOut)
async def fail_order(order_id: int, db: AsyncSession = Depends(get_async_db)):
    order = await _order(db, order_id)
    if order.status == "PAID":
        raise HTTPException(status.HTTP_409_CONFLICT, "Order is already paid")
    order.status = "FAILED"
    await db.commit()
    return await _order_out(db, order)


@router.get("/webhook-logs", response_model=list[WebhookLogOut])
async def webhook_logs(result: str | None = None, db: AsyncSession = Depends(get_async_db)):
    q = select(WebhookLog).order_by(WebhookLog.id.desc()).limit(200)
    if result:
        q = q.where(WebhookLog.result == result.upper())
    return [WebhookLogOut.model_validate(r) for r in (await db.scalars(q)).all()]


def _statement_rows(text: str):
    for row in csv.DictReader(io.StringIO(text)):
        low = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        amount = next((v for k, v in low.items() if re.search(r"credit|deposit|amount", k) and re.search(r"[1-9]", v)), "")
        ref = next((v for k, v in low.items() if re.search(r"utr|ref|chq|reference", k)), "")
        utr = (re.search(r"(?<!\d)\d{12}(?!\d)", ref) or re.search(r"(?<!\d)\d{12}(?!\d)", " ".join(low.values())))
        if amount and utr:
            yield utr.group(0), to_paise(re.sub(r"[^\d.,]", "", amount)), " ".join(low.values())[:200]


@router.post("/bank-statement")
async def upload_statement(file: UploadFile = File(...), db: AsyncSession = Depends(get_async_db)):
    text = (await file.read(2_000_000)).decode("utf-8-sig", errors="replace")
    await expire_old(db)
    added = settled = 0
    for utr, paise, narration in _statement_rows(text):
        if await db.scalar(select(BankEntry.id).where(BankEntry.utr == utr)):
            continue
        entry = BankEntry(utr=utr, amount_paise=paise, narration=narration)
        db.add(entry)
        added += 1
        order = await pending_by_amount(db, paise)
        if order and await mark_paid(db, order, utr=utr, raw=narration, source="BANK_STATEMENT"):
            entry.claimed = True
            settled += 1
    await db.commit()
    return {"added": added, "settled": settled}
