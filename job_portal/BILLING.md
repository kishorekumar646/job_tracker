# Billing setup (UPI / bank transfer, no payment gateway)

## 1. Configure `job_portal/.env`

```
UPI_ID=yourname@bank
UPI_PAYEE_NAME=JobPilot
PAYMENT_WEBHOOK_SECRET=<long random string, e.g. output of: openssl rand -hex 32>
PRO_PRICE_INR=499
PRO_DAYS=30
ORDER_MINUTES=15
# optional bank transfer details shown next to the QR
BANK_ACCOUNT_NAME=
BANK_ACCOUNT_NUMBER=
BANK_IFSC=
BANK_NAME=
# optional: emails the PDF invoice (otherwise users download it from Plans)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Restart the backend (new tables are created automatically). `pip install -r requirements.txt` adds `reportlab`.

## 2. Make the server reachable

The forwarder must reach `POST https://<your-domain>/api/webhooks/payment-verify`.
Locally, expose it with a tunnel (e.g. `cloudflared tunnel --url http://localhost:8886`).

## 3a. Android SMS forwarder (Method A)

1. Install an SMS-forwarding app that supports HTTP webhooks (e.g. "SMS Forwarder", "SmsForwarder", or Tasker).
2. Rule: forward SMS from your bank's sender ID (e.g. `*HDFCBK*`, `*SBIUPI*`) containing `credited` or `received`.
3. Action: HTTP `POST` to the URL above.
   - Header: `X-Webhook-Secret: <PAYMENT_WEBHOOK_SECRET>` (if the app cannot set headers, append `?secret=<secret>` to the URL).
   - Body (JSON): `{"text": "{{SMS_BODY}}"}` (use your app's message placeholder). Plain-text and form bodies also work.
4. Send a test SMS and check Admin -> Orders -> Bank alert log: it should show `MATCHED`, or `UNMATCHED` if no order has that amount.

## 3b. Email forwarder (Method A)

Bank credit emails can be forwarded the same way using Google Apps Script (Gmail), Zapier/Make/n8n "new email -> webhook",
sending `{"text": "<subject> <body>"}` with the same header. Filter on your bank's sender address.

## 4. Method B: bank statement CSV

Admin -> Orders -> "Upload bank statement (CSV)". Needs a column with the credited amount (header containing
`credit`, `deposit` or `amount`) and a 12-digit UTR in a `ref`/`utr`/narration column. Open orders whose exact amount
appears are settled immediately, and users who enter a UTR on the Plans page are verified against these rows.

## How matching works

- Each order gets a unique payable amount (base price + 1-99 paise) that no other open order uses, and an order ID `JPxxxxxx` sent as the UPI note (`tn`).
- An alert is accepted only if it is a credit (debits are ignored) and its amount equals an open order's amount. If it also carries the order ID, that order is preferred.
- Balance figures ("Avl Bal Rs ...") are stripped before parsing amounts.
- A UTR can settle only one order (unique in the database); replays are logged as `DUPLICATE`.
- Wrong amount or expired order: the alert shows as `UNMATCHED`; use Admin -> Orders -> Approve.

## Limits

- Not every bank puts the UPI note or UTR in SMS; amount matching covers this, which is why amounts are unique.
- Only 99 orders can be open at the same time.
- Webhook trust rests on the shared secret. Keep it private and use HTTPS.

## Option: read bank emails directly (no forwarder)

Set these and restart; the server then checks the mailbox every 20 seconds and settles orders automatically
(it reads unread mail, so use a mailbox your bank's credit alerts reach; for Gmail use an App Password):

```
IMAP_HOST=imap.gmail.com
IMAP_USER=you@gmail.com
IMAP_PASSWORD=<gmail app password>
IMAP_FROM=sbi.co.in        # optional sender filter
```

With this set, `PAYMENT_WEBHOOK_SECRET` is optional. Enable the bank's UPI credit email alerts in net banking first.
