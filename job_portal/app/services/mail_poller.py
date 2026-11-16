"""
Author: Kishore Kumar
Reads bank credit-alert emails from a mailbox over IMAP and settles matching orders, so no SMS/email forwarder is needed.
"""

import asyncio
import email
import imaplib
import logging
import re
from email.header import decode_header, make_header

from ..database import async_session_factory, settings
from .billing import process_alert

logger = logging.getLogger("job_portal.mail_poller")


def _body_text(msg: email.message.Message) -> str:
    parts = []
    for part in msg.walk():
        if part.get_content_type() in ("text/plain", "text/html"):
            payload = part.get_payload(decode=True)
            if payload:
                text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
                parts.append(re.sub(r"<[^>]+>", " ", text) if part.get_content_type() == "text/html" else text)
    return re.sub(r"\s+", " ", " ".join(parts))


def fetch_unseen() -> list[str]:
    """Blocking: returns the text of unread bank mails and marks them read."""
    criteria = ["UNSEEN"] + (["FROM", f'"{settings.IMAP_FROM}"'] if settings.IMAP_FROM else [])
    texts = []
    with imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT) as imap:
        imap.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        imap.select("INBOX")
        _, data = imap.search(None, *criteria)
        for num in (data[0] or b"").split()[-50:]:
            _, msg_data = imap.fetch(num, "(RFC822)")
            msg = email.message_from_bytes(msg_data[0][1])
            subject = str(make_header(decode_header(msg.get("Subject", ""))))
            texts.append(f"{subject} {_body_text(msg)}")
    return texts


async def poll_forever() -> None:
    logger.info("Watching %s for bank credit alerts every %ss", settings.IMAP_USER, settings.IMAP_POLL_SECONDS)
    delay = max(5, settings.IMAP_POLL_SECONDS)
    failures = 0
    while True:
        try:
            for text in await asyncio.to_thread(fetch_unseen):
                async with async_session_factory() as db:
                    result = await process_alert(db, text, source="EMAIL")
                logger.info("bank alert email -> %s", result)
            failures = 0
        except asyncio.CancelledError:
            raise
        except imaplib.IMAP4.error as exc:
            # Bad credentials won't fix themselves: log one line and back off up to 10 minutes.
            failures += 1
            if failures == 1 or failures % 20 == 0:
                logger.error("Bank mailbox login/poll failed: %s. For Gmail use a 16-character App Password "
                             "(Google Account > Security > 2-Step Verification > App passwords) as IMAP_PASSWORD.",
                             exc.args[0].decode(errors="replace") if exc.args and isinstance(exc.args[0], bytes) else exc)
        except Exception:
            failures += 1
            if failures == 1 or failures % 20 == 0:
                logger.exception("bank mail poll failed")
        await asyncio.sleep(min(600, delay * (2 ** min(failures, 5))) if failures else delay)
