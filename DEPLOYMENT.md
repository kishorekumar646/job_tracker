# Deploy JobPilot on Render + Supabase

This setup uses one Render web service for the React frontend and FastAPI backend, with Supabase
PostgreSQL for accounts, applications, billing, profile photos and resume files. It does not use Supabase Auth.

The public address is a free HTTPS subdomain such as `https://YOUR-SERVICE.onrender.com`.
A custom registered domain is optional and is not included. Serving everything on one origin
keeps HttpOnly login cookies and PWA installation working without cross-site-cookie dependencies.

## Free-tier limits

- [Render Free](https://render.com/docs/free) sleeps after 15 idle minutes. Waking can take about
  a minute. It has ephemeral disk storage, no shell access, and blocks outbound SMTP ports
  25/465/587. Usage quotas also apply. Render explicitly does not recommend free instances for production.
- [Supabase Free](https://supabase.com/pricing) includes a 500 MB database and may pause projects
  after a week of inactivity. Resumes and profile photos count toward the database limit; this setup does
  **not** use the separate Supabase Storage quota. Monitor usage and arrange your own backups.
- Background schedules and bank-mail polling stop when Render sleeps. The blueprint disables
  scheduled auto-apply; **Run now** remains available. Do not promise unattended auto-apply or
  continuously monitored automatic payments on a sleeping free service. Use an always-on paid
  service/worker when those become requirements.
- Verification email uses the [Brevo HTTPS API](https://developers.brevo.com/reference/send-transac-email),
  not blocked SMTP ports. A Brevo account, approved transactional sending and a verified sender
  are required. Check its current [free plan and sending limits](https://www.brevo.com/pricing/).
  An `onrender.com` address does not give you ownership of an email-sending domain.

## 1. Create Supabase

1. Create a Free project in [Supabase](https://supabase.com/dashboard). Choose a region near your
   Render service; the blueprint uses Singapore.
2. Save your database password securely.
3. Open **Connect → Session pooler** and copy the connection URI. Use the actual host shown in
   your dashboard and port **5432**, not the transaction pooler's port 6543.
4. Replace the password placeholder with your percent-encoded database password. Add
   `?sslmode=require` if there is no query string, or `&sslmode=require` if there is one.

Example shape only:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@YOUR-POOLER-HOST:5432/postgres?sslmode=require
```

The backend normalizes this to SQLAlchemy's async Psycopg driver. Session pooling supports
prepared statements and IPv4; see the [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Do not put the database URL, password or service-role key in the frontend or Git.
No Supabase API key is needed by this application. Tables are created at startup, with RLS enabled
on PostgreSQL and no browser-facing policies. The table-owning backend role accesses them;
browser `anon`/`authenticated` roles must not get direct access to private account data.

## 2. Configure email

In Brevo, verify a sender you control and enable transactional sending. Obtain an API key.
You will enter these directly in Render, never in the frontend:

| Variable | Value |
| --- | --- |
| `BREVO_API_KEY` | Your transactional email API key |
| `BREVO_SENDER_EMAIL` | The verified sender address |
| `BREVO_SENDER_NAME` | Optional; defaults to `JobPilot` |

This integration sends **verification codes**. PDF invoices remain downloadable from Plans;
the existing optional SMTP invoice sender is not usable on Render Free's blocked SMTP ports.
When secure cookies are enabled, missing email configuration fails explicitly rather than
printing verification codes to production logs.

## 3. Deploy the repository

1. Save and push the intended application changes, including `Dockerfile`, `.dockerignore` and
   `render.yaml`, to your GitHub repository. Do not push local credentials, databases, uploads or virtualenvs.
2. Sign in to [Render](https://dashboard.render.com), choose **New → Blueprint**, and connect the repository.
3. Review the blueprint: **one Docker web service, Free plan**. Change the service name if needed.
4. Supply `DATABASE_URL`, `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` when prompted.
5. Apply the blueprint. Docker builds the frontend and installs backend dependencies.
   The backend listens on Render's `PORT` and serves both frontend and `/api`.

The blueprint generates `JWT_SECRET_KEY` and enables `COOKIE_SECURE=true`. Keep the generated
secret stable: replacing it invalidates existing sessions. Access tokens last 30 minutes and
the refresh lifetime defaults to seven days. If you also set `REFRESH_TOKEN_EXPIRE_MINUTES`,
that value takes precedence over days.

No separate static site, database on Render, Redis service, or frontend API URL is required.
`CORS_ORIGINS` is empty because frontend/API traffic is same-origin.

The Docker build excludes local `.env` files and `.npmrc` credentials and installs public npm
dependencies. Local secret settings are intentionally not copied to Render.

## 4. Create the first admin

1. Open the Render HTTPS address, sign up, activate TOTP, sign in, and verify your email.
2. In your project's **Supabase SQL Editor**, run the following using your own account email:

```sql
UPDATE public.users
SET role = 'admin', is_admin = TRUE
WHERE email = 'YOUR_SIGNED_UP_EMAIL'
  AND is_approved = TRUE;
```

3. Sign out and sign in again. The Admin page should appear.

This avoids needing shell access on Render Free. No default administrator or shared admin
password is created.

## 5. Optional features

Set additional backend variables in Render's Environment page and redeploy:

- Live job feed: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRY`.
- Payments: follow [billing configuration](job_portal/BILLING.md), including your UPI recipient,
  plan pricing and webhook/mail verification settings. Test the complete payment-confirmation
  path before accepting real payments. A QR scan alone does not confirm a payment.
- Scheduling: `AUTO_APPLY_INTERVAL_MINUTES=30` can run sweeps **while the process is awake**.
  Upgrade hosting before relying on an unattended schedule or continuous IMAP payment polling.

The visible job list polls the stored catalogue every 30 seconds; this does not contact external
job providers. **Fetch live jobs** imports postings for the user's preferred titles and locations.
Eligible auto-apply runs also fetch postings before matching. There is no independent external
job-feed polling schedule, and the free blueprint disables scheduled auto-apply.

No existing local SQLite records or legacy resume files are automatically migrated to Supabase.
Keep local backups and plan a separate data migration if you need that history. New resume
uploads are stored in the database; local filesystem paths are only a backward-compatible
fallback for existing installations.

## Custom domains (optional)

The free `YOUR-SERVICE.onrender.com` address is enough to launch. A registered domain such as
`example.com` must be obtained separately; Render does not provide free domain registration.
There is no standard permanently free `.com` registration plan. Offers such as
[Hostinger's free first-year domain](https://www.hostinger.com/free-domain) require an eligible
paid annual hosting plan and charge regular domain renewal fees afterward. For a zero-cost
launch, use the included Render subdomain rather than buying hosting solely for a domain offer.
Render currently includes two custom domains on its Hobby workspace plan and automatically
issues and renews HTTPS certificates; check its [current domain limits](https://render.com/docs/custom-domains).

1. In your Render service, open **Settings → Custom Domains → Add Custom Domain**.
2. Enter the domain you control, for example `jobs.example.com`.
3. At your DNS provider, add the records Render specifies. A subdomain normally uses a CNAME
   pointing to `YOUR-SERVICE.onrender.com` (without `https://`). For a root domain, follow
   Render's provider-specific ALIAS/ANAME or A-record instructions; do not guess an IP.
4. Return to Render and click **Verify**. Wait for DNS propagation and certificate issuance.
5. Open the custom HTTPS address and repeat the launch checks below.

Keep the frontend and API on the same custom domain. The application uses relative `/api/v1`
URLs, so no frontend rebuild, Supabase Auth redirect setting, or additional CORS origin is needed
for this same-origin setup. Keep `COOKIE_SECURE=true`. Update any configured external payment
webhook URLs to the new domain.

For device/passkey sign-in, set **both** of these to the canonical custom domain in Render:

```text
WEBAUTHN_ORIGIN=https://jobs.example.com
WEBAUTHN_RP_ID=jobs.example.com
```

The origin includes `https://`; the RP ID is only the hostname, without a scheme, port or path.
For the default Render address these are derived from Render's `RENDER_EXTERNAL_URL`.
Passkeys cannot be safely configured from the request's Host header.

Cookies and installed PWAs are origin-specific: users must sign in on the custom domain, and
an app installed from the Render subdomain must be installed again from the custom domain.
Database accounts, profile photos and other saved data remain the same.
Passkeys are RP/domain-specific too. Keep TOTP as a fallback and enroll again on the final
domain. WebAuthn requires HTTPS, a compatible browser and an enabled device screen lock;
native biometric/PIN behavior must be checked on actual target phones before launch.

## Launch checks

- `GET https://YOUR-SERVICE.onrender.com/api/v1/ping` returns `{"status":"ok"}`.
- `/signup`, `/login` and reloading `/dashboard` serve the frontend; missing API routes return 404,
  not the frontend HTML.
- Signup, authenticator setup, email verification, login, refresh and logout all work on HTTPS.
- Upload and download a resume, restart/redeploy, and confirm the same resume still downloads.
- Upload a profile photo in Settings → Profile, reload/redeploy, and confirm the header still shows it.
- Verify your admin account, Pro grants, counts, and mobile layouts.
- Enable a device passkey from Profile with a TOTP code, sign out, test device sign-in and
  authenticator fallback, then remove the device and confirm it can no longer sign in.
- Confirm the guide appears automatically only twice per account and always opens from Guide.
- Check `/manifest.json`, `/sw.js` and app installation on an actual phone.
- Check free-plan usage and backups before sharing the URL widely.

## Local verification

```bash
cd job_portal
venv/bin/python -m pytest -q
cd ../frontend
npm run build
```

The test suite can also use `TEST_DATABASE_URL` with a **throwaway** PostgreSQL database.
**It drops and recreates application tables. Never point it at Supabase or any database with real data.**

If Docker is installed, build from the repository root with `docker build -t jobpilot .`.
Run it with backend environment variables supplied securely and port 10000 published.
