"""
Author: Kishore Kumar
Method A: bank credit alerts forwarded by an SMS / email forwarder.

    POST /api/webhooks/payment-verify     header ``X-Webhook-Secret: <PAYMENT_WEBHOOK_SECRET>`` (or ``?secret=``)

The body may be JSON (``text`` / ``message`` / ``body`` / ``sms`` ...), a form post, or plain text. The alert is
parsed for amount, UTR and order note, matched to a pending order and marked PAID. Every call is logged.
"""

import json
import secrets
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_async_db, settings
from ..services.billing import process_alert

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

_TEXT_KEYS = ("text", "message", "body", "sms", "content", "msg", "snippet", "subject")
MAX_BODY = 16_000


def _extract_text(raw: bytes) -> str:
    body = raw.decode("utf-8", errors="replace")
    try:
        data = json.loads(body)
    except ValueError:
        data = None
    if isinstance(data, dict):
        return " ".join(str(data[k]) for k in _TEXT_KEYS if data.get(k)) or json.dumps(data)
    if isinstance(data, str):
        return data
    if "=" in body and "\n" not in body.strip() and "&" in body:
        form = parse_qs(body)
        picked = [v[0] for k, v in form.items() if k.lower() in _TEXT_KEYS]
        if picked:
            return " ".join(picked)
    return body


@router.post("/payment-verify")
async def payment_verify(request: Request, secret: str = "", db: AsyncSession = Depends(get_async_db)):
    expected = settings.PAYMENT_WEBHOOK_SECRET
    given = request.headers.get("x-webhook-secret") or secret
    if not expected or not secrets.compare_digest(given, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook secret")
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Payload too large")
    result = await process_alert(db, _extract_text(raw), source="WEBHOOK")
    return {"result": result, "matched": result == "MATCHED"}
