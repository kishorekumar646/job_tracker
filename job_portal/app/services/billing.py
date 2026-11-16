"""
Author: Kishore Kumar
Order lifecycle: create, expire, and mark paid (idempotent, one UTR pays one order).
"""

import asyncio
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import settings
from ..models import Notification, Order, Subscription, Transaction, User, WebhookLog
from .invoice import build_invoice_pdf, email_invoice
from .payment_parser import parse_alert
from .plans import grant_pro

PLAN_LABELS = {"pro": "JobPilot Pro"}


async def expire_old(db: AsyncSession) -> None:
    await db.execute(update(Order).where(Order.status == "PENDING", Order.expires_at < datetime.utcnow()).values(status="EXPIRED"))
    await db.flush()


async def open_order(db: AsyncSession, user: User) -> Order:
    """The caller's live order, or a new one with an amount no other open order uses."""
    await expire_old(db)
    order = await db.scalar(select(Order).where(Order.user_id == user.id, Order.status == "PENDING"))
    if order:
        return order
    base = settings.PRO_PRICE_INR * 100
    taken = set((await db.scalars(select(Order.unique_amount).where(Order.status == "PENDING"))).all())
    free = [k for k in range(1, 100) if base + k not in taken]
    if not free:
        raise RuntimeError("no free payment amounts")
    order = Order(
        order_ref="JP" + secrets.token_hex(3).upper(), user_id=user.id, plan_id="pro",
        base_amount=base, unique_amount=base + secrets.choice(free),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.ORDER_MINUTES),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


async def utr_used(db: AsyncSession, utr: str | None) -> bool:
    return bool(utr) and await db.scalar(select(Transaction.id).where(Transaction.utr_number == utr)) is not None


async def mark_paid(db: AsyncSession, order: Order, *, utr: str | None, raw: str | None, source: str) -> bool:
    """Returns False if the order was already settled or the UTR was already used."""
    if order.status == "PAID" or await utr_used(db, utr):
        return False
    user = await db.get(User, order.user_id)
    now = datetime.utcnow()
    start = user.plan_expires_at if user.plan == "pro" and user.plan_expires_at and user.plan_expires_at > now else now
    grant_pro(user)
    order.status, order.paid_at = "PAID", now
    order.invoice_no = f"INV-{now:%Y}-{order.id:05d}"
    db.add(Transaction(order_id=order.id, utr_number=utr, raw_payload=(raw or "")[:2000], verified_at=now, verification_source=source))
    db.add(Subscription(user_id=user.id, order_id=order.id, plan_id=order.plan_id, status="ACTIVE", start_date=start, end_date=user.plan_expires_at))
    db.add(Notification(user_id=user.id, notif_type="billing", title="Payment verified - Pro activated",
                        message=f"We received INR {order.unique_amount / 100:.2f}. Pro is active until {user.plan_expires_at:%d %b %Y}. Invoice {order.invoice_no}."))
    try:
        await db.commit()
    except IntegrityError:  # lost a race on the same UTR
        await db.rollback()
        return False
    pdf = build_invoice_pdf(
        invoice_no=order.invoice_no, order_ref=order.order_ref, customer=user.name or user.email, email=user.email,
        plan=PLAN_LABELS.get(order.plan_id, order.plan_id), amount_paise=order.unique_amount, paid_at=now,
        period_start=start, period_end=user.plan_expires_at, utr=utr,
    )
    asyncio.create_task(email_invoice(user.email, order.invoice_no, PLAN_LABELS.get(order.plan_id, order.plan_id), pdf))
    return True


async def pending_by_amount(db: AsyncSession, paise: int) -> Order | None:
    return await db.scalar(select(Order).where(Order.status == "PENDING", Order.unique_amount == paise, Order.expires_at > datetime.utcnow()))


async def process_alert(db: AsyncSession, text: str, source: str = "WEBHOOK") -> str:
    """Parse a bank credit alert, settle the matching order, and log the outcome."""
    parsed = parse_alert(text)
    log = WebhookLog(raw=text[:2000], amount_paise=parsed.amounts_paise[0] if parsed.amounts_paise else None,
                     utr=parsed.utr, order_ref=parsed.order_ref, result="IGNORED")
    db.add(log)

    async def finish(result: str, order: Order | None = None) -> str:
        log.result, log.order_id = result, order.id if order else None
        await db.commit()
        return result

    if not parsed.is_credit or not parsed.amounts_paise:
        return await finish("IGNORED")
    await expire_old(db)
    if await utr_used(db, parsed.utr):
        return await finish("DUPLICATE")

    order = None
    if parsed.order_ref:  # the note identifies the order; the amount must still agree
        cand = await db.scalar(select(Order).where(Order.order_ref == parsed.order_ref))
        if cand and cand.status == "PENDING" and cand.unique_amount in parsed.amounts_paise:
            order = cand
    if not order:
        for paise in parsed.amounts_paise:
            order = await pending_by_amount(db, paise)
            if order:
                break
    if not order:
        return await finish("UNMATCHED")
    if not await mark_paid(db, order, utr=parsed.utr, raw=text, source=source):
        return await finish("DUPLICATE", order)
    return await finish("MATCHED", order)
