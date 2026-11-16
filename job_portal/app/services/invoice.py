"""
Author: Kishore Kumar
PDF invoice generation (reportlab) and emailing.
"""

import asyncio
import io
import logging
import smtplib
from email.message import EmailMessage

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from ..database import settings

logger = logging.getLogger("job_portal")


def build_invoice_pdf(*, invoice_no: str, order_ref: str, customer: str, email: str, plan: str, amount_paise: int,
                      paid_at, period_start, period_end, utr: str | None) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    c.setFillColor(colors.HexColor("#4f46e5"))
    c.rect(0, h - 32 * mm, w, 32 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, h - 20 * mm, settings.INVOICE_SELLER_NAME)
    c.setFont("Helvetica", 11)
    c.drawRightString(w - 20 * mm, h - 20 * mm, "TAX INVOICE / RECEIPT")

    c.setFillColor(colors.black)
    y = h - 48 * mm
    rows = [
        ("Invoice no.", invoice_no), ("Order ID", order_ref), ("Date", f"{paid_at:%d %b %Y, %H:%M} UTC"),
        ("Billed to", f"{customer} <{email}>"), ("Payment", f"UPI / bank transfer{f' (UTR {utr})' if utr else ''}"),
    ]
    for k, v in rows:
        c.setFont("Helvetica-Bold", 10); c.drawString(20 * mm, y, k)
        c.setFont("Helvetica", 10); c.drawString(55 * mm, y, v)
        y -= 7 * mm
    y -= 6 * mm
    c.setFillColor(colors.HexColor("#f3f4f6")); c.rect(20 * mm, y - 2 * mm, w - 40 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.black); c.setFont("Helvetica-Bold", 10)
    c.drawString(23 * mm, y, "Description"); c.drawRightString(w - 23 * mm, y, "Amount")
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    c.drawString(23 * mm, y, f"{plan} subscription ({period_start:%d %b %Y} - {period_end:%d %b %Y})")
    c.drawRightString(w - 23 * mm, y, f"INR {amount_paise / 100:,.2f}")
    y -= 12 * mm
    c.line(20 * mm, y + 5 * mm, w - 20 * mm, y + 5 * mm)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(23 * mm, y - 2 * mm, "Total paid"); c.drawRightString(w - 23 * mm, y - 2 * mm, f"INR {amount_paise / 100:,.2f}")
    c.setFont("Helvetica", 8); c.setFillColor(colors.grey)
    c.drawString(20 * mm, 20 * mm, "This is a computer-generated invoice and needs no signature. " + settings.INVOICE_SELLER_ADDRESS)
    c.showPage(); c.save()
    return buf.getvalue()


def _send(to: str, subject: str, body: str, filename: str, pdf: bytes) -> None:
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, settings.SMTP_FROM or settings.SMTP_USER, to
    msg.set_content(body)
    msg.add_attachment(pdf, maintype="application", subtype="pdf", filename=filename)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


async def email_invoice(to: str, invoice_no: str, plan: str, pdf: bytes) -> None:
    if not settings.SMTP_HOST:
        logger.warning("SMTP not configured - invoice %s for %s not emailed (download it from Plans)", invoice_no, to)
        return
    try:
        await asyncio.to_thread(_send, to, f"Your {settings.INVOICE_SELLER_NAME} invoice {invoice_no}",
                                f"Thanks for subscribing to {plan}. Your invoice is attached.", f"{invoice_no}.pdf", pdf)
    except Exception:
        logger.exception("Could not email invoice %s", invoice_no)
