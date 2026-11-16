"""
Author: Kishore Kumar
Plans, checkout and invoices, mounted at ``/api/v1/billing``.

    GET  /billing/me                    your plan, limits and today's usage
    POST /billing/orders                open (or reuse) a checkout: unique amount, UPI QR, 15-min timer
    GET  /billing/orders                your orders
    GET  /billing/orders/{id}           poll status (PENDING -> PAID / EXPIRED)
    POST /billing/orders/{id}/utr       Method B: verify a 12-digit UTR against the uploaded bank statement
    GET  /billing/orders/{id}/invoice   PDF invoice for a paid order

Method A (bank alert webhook) lives in ``api/webhooks.py``.
"""

from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth import auth_manager
from ...database import get_async_db, settings
from ...deps import get_current_user
from ...models import BankEntry, Order, Subscription, Transaction, User
from ...schemas import BillingMe, Checkout, OrderOut, PlanLimits, UtrSubmit
from ...services.auto_apply import applied_today, auto_applied_total
from ...services.billing import PLAN_LABELS, expire_old, mark_paid, open_order, utr_used
from ...services.invoice import build_invoice_pdf
from ...services.plans import daily_apply_cap, effective_plan, lifetime_apply_cap

router = APIRouter(prefix="/billing", tags=["billing"])


def payments_configured() -> bool:
    return bool(settings.UPI_ID and (settings.PAYMENT_WEBHOOK_SECRET or settings.IMAP_HOST))


async def _own_order(db: AsyncSession, user: User, order_id: int) -> Order:
    await expire_old(db)
    order = await db.get(Order, order_id)
    if not order or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.get("/me", response_model=BillingMe)
async def billing_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    plan = effective_plan(user)
    return BillingMe(
        plan=plan, plan_expires_at=user.plan_expires_at if plan == "pro" else None,
        free=PlanLimits(total_auto_apply=settings.FREE_TOTAL_APPLY_LIMIT),
        pro=PlanLimits(daily_auto_apply=settings.PRO_DAILY_APPLY_LIMIT),
        price_inr=settings.PRO_PRICE_INR, pro_days=settings.PRO_DAYS,
        applied_today=await applied_today(db, user.id), daily_limit=daily_apply_cap(user),
        lifetime_used=await auto_applied_total(db, user.id), lifetime_limit=lifetime_apply_cap(user),
        upi_configured=payments_configured(),
    )


@router.post("/orders", response_model=Checkout, status_code=status.HTTP_201_CREATED)
async def create_order(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    if not payments_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payments are not set up yet. Please contact the admin.")
    try:
        order = await open_order(db, user)
    except RuntimeError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Too many open payments right now. Try again in a few minutes.")
    amount = f"{order.unique_amount / 100:.2f}"
    uri = f"upi://pay?pa={quote(settings.UPI_ID)}&pn={quote(settings.UPI_PAYEE_NAME)}&am={amount}&cu=INR&tn={order.order_ref}"
    return Checkout(
        order=OrderOut.model_validate(order), amount=amount, payee_name=settings.UPI_PAYEE_NAME,
        upi_uri=uri, qr_code=auth_manager.qr_data_uri(uri),
        seconds_left=max(0, int((order.expires_at - datetime.utcnow()).total_seconds())),
    )


@router.get("/orders", response_model=list[OrderOut])
async def my_orders(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    await expire_old(db)
    rows = (await db.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.id.desc()).limit(50))).all()
    return [OrderOut.model_validate(o) for o in rows]


@router.get("/orders/{order_id}", response_model=OrderOut)
async def order_status(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    return OrderOut.model_validate(await _own_order(db, user, order_id))


@router.post("/orders/{order_id}/utr", response_model=OrderOut)
async def submit_utr(order_id: int, body: UtrSubmit, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    order = await _own_order(db, user, order_id)
    utr = body.utr.strip()
    if not utr.isdigit():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "UTR is 12 digits.")
    if order.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This order is {order.status.lower()}.")
    if await utr_used(db, utr):
        raise HTTPException(status.HTTP_409_CONFLICT, "That transaction ID has already been used.")
    entry = await db.scalar(select(BankEntry).where(BankEntry.utr == utr))
    if not entry or entry.claimed or entry.amount_paise != order.unique_amount:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We could not find that payment yet. Check the exact amount and try again in a few minutes.")
    entry.claimed = True
    if not await mark_paid(db, order, utr=utr, raw=entry.narration, source="BANK_STATEMENT"):
        raise HTTPException(status.HTTP_409_CONFLICT, "That transaction ID has already been used.")
    await db.refresh(order)
    return OrderOut.model_validate(order)


@router.get("/orders/{order_id}/invoice")
async def invoice(order_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    order = await _own_order(db, user, order_id)
    if order.status != "PAID":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice is available once the order is paid.")
    tx = await db.scalar(select(Transaction).where(Transaction.order_id == order.id))
    sub = await db.scalar(select(Subscription).where(Subscription.order_id == order.id))
    pdf = build_invoice_pdf(
        invoice_no=order.invoice_no, order_ref=order.order_ref, customer=user.name or user.email, email=user.email,
        plan=PLAN_LABELS.get(order.plan_id, order.plan_id), amount_paise=order.unique_amount, paid_at=order.paid_at,
        period_start=sub.start_date if sub else order.paid_at, period_end=sub.end_date if sub else order.paid_at, utr=tx.utr_number if tx else None,
    )
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{order.invoice_no}.pdf"'})
