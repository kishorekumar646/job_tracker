# JobPilot

Auto-apply to jobs that match your resume skills, preferred titles and locations.

- `job_portal/` – FastAPI backend (SQLite, JWT in HttpOnly cookies). Swagger at http://localhost:8886/docs
- `frontend/` – React + TypeScript + Vite + Tailwind UI at http://localhost:5173

## Run

```bash
./run.sh            # installs dependencies, starts backend :8886 and frontend :5173
cd job_portal && venv/bin/python -m pytest -q   # backend tests
cd frontend && npm run build                    # type-check + production build
```

## Deployment

See [Render + Supabase deployment](../DEPLOYMENT.md) for the free HTTPS subdomain setup,
PostgreSQL, persistent resumes, email delivery, first-admin creation and free-tier limitations.
The free configuration is a beta/hobby deployment, not an always-on production service.

## Create an administrator

From `job_portal/`, activate the backend virtualenv and run `python createsuperuser`.
Enter an existing account's email and its current authenticator code (hidden input).
Only activated, active accounts with a valid code are promoted. Sign out and back in afterward.
The legacy `python tools/make_admin.py <email>` command now prompts for the code too.
For production, configure the backend with Render's Supabase `DATABASE_URL` before running;
otherwise this command affects only your local database. Keep database credentials private.
The command identifies whether it is using SQLite or PostgreSQL without printing credentials,
and rejects incomplete email addresses before any database lookup. You can also pass the email
explicitly as `python createsuperuser "you@gmail.com"`; only the authenticator code is then prompted.
An exported `DATABASE_URL` in your shell takes precedence over the `.env` value.

## How it works

1. Sign up with email and an authenticator app (TOTP, no password): on desktop, scan the QR code using your phone. On mobile devices, **Open in Authenticator** adds the account to a compatible installed app; the QR remains as an alternative for scanning from another device. The setup key is not displayed as text. Return to JobPilot and enter the 6-digit code to activate, then use a fresh code each time you sign in. Upload a resume (PDF/DOCX/TXT) – skills are detected automatically.
2. Set preferred job titles, locations, job types and minimum salary.
3. Connect LinkedIn, Naukri, Indeed, Glassdoor, Foundit or Instahyre.
4. Auto-apply scores every job (55% skills, 30% title, 15% location), and applies to those above your
   minimum match score on connected platforms, up to your daily limit. It runs on a schedule
   (`AUTO_APPLY_INTERVAL_MINUTES`, default 30, `0` disables) or on demand.

## Limitations

These platforms offer no public apply API or OAuth for this use case. "Connect" stores your profile
URL/handle (validated by domain), the job feed combines public-provider postings, samples and jobs you add, and
auto-apply records applications in the tracker instead of submitting them on the external sites.

Settings (env vars): `DATABASE_URL`, `JWT_SECRET_KEY` (required), `CORS_ORIGINS`, `MAX_RESUME_MB`, `AUTO_APPLY_INTERVAL_MINUTES`.

## Profile photos

Settings > Profile supports uploading, replacing and removing your photo. It appears immediately
in the header, its profile preview and settings; initials are used when no photo is set.
JPG, PNG and WebP files up to 2 MB and 16 megapixels are accepted. Images are orientation-corrected,
resized to at most 256 pixels and re-encoded as JPEG without camera metadata.
Photos are saved with the user's account in the database, not on Render's ephemeral filesystem.
Only the signed-in user can change their photo through `POST` / `DELETE /api/v1/profile/avatar`.

## Job refresh

Visible, online job lists refresh the stored catalogue every 30 seconds and on focus or successful
changes. This polling does **not** fetch new postings from external sites.
**Fetch live jobs** imports postings for preferred titles/locations from Remotive and Arbeitnow,
plus Adzuna when configured. Eligible auto-apply runs fetch postings before matching too.
There is no independent external-feed polling schedule. Scheduled auto-apply only runs when
enabled and the backend is awake; the free Render blueprint disables that schedule.

## Installed app and mobile access

- **Install App** is beside the username in the header (an install icon on phones). Chrome/Edge show the
  native prompt when eligible; iPhone/iPad users get Safari > Share > Add to Home Screen instructions.
- The public homepage also has a prominent gold install banner directly below navigation, with a
  full-width labeled button on phones. Visitors can install before signing up, using the same flow.
- The banner and installation dialog explain the browser-installed app, optional installation,
  device access, online account storage and limited service-worker cache. They show the current
  hostname and recommend HTTPS to keep data encrypted in transit. Uninstalling does not delete
  server-held account data; account/data requests go through the homepage's developer contact.
- After installation the button stays hidden across visits in that browser. A new native install
  prompt restores it if the app becomes installable again. Installation in other browsers cannot
  be detected reliably.
- Deploy the frontend on **HTTPS** for installation on phones. `http://localhost:5173` is suitable
  for desktop development; a phone's `localhost` is not your computer. An HTTP LAN IP can preview
  the responsive UI but cannot install a PWA. For LAN previews, run Vite with `npm run dev -- --host 0.0.0.0`.
- Serve `manifest.json`, `sw.js`, `offline.html` and the icons at the site root, and forward `/api`
  to the backend on the same origin. Serve `sw.js` with revalidation (`Cache-Control: no-cache`).
- The service worker caches only the offline notice and public icons, never API responses, account
  pages, resumes or payments. Live features require internet. It replaces the prior worker at `/sw.js`
  without caching old dashboard HTML.
- Navigation, settings, forms and admin views adapt to narrow screens; settings and dialogs scroll
  separately, and the installed app uses the device's safe area and dynamic viewport height.
- Below desktop width, a persistent bottom bar provides Home, Jobs, Tracker, Auto-apply and More.
  More opens the existing navigation drawer for Connections, Plans and admin access. The bar sits
  outside the scrolling content, respects the bottom safe area and never covers page actions.
  Phone workspaces use gold-accented editorial headers, layered cards and larger touch controls.
- Connectivity recovery dismisses the offline banner in place, without reloading or navigating.
  The current page, signup step and entered values remain intact. Connectivity probes pause while
  the app is hidden and check again on return, including after opening an authenticator app.
  Slow probes show a non-blocking **Reconnecting to JobPilot** notice after five seconds and
  allow up to 90 seconds for a sleeping server to wake. Failed probes show **Cannot reach
  JobPilot**, not a claim that the internet is disconnected; the offline message is reserved
  for browser-reported disconnection. Health checks require the API's JSON response, so a
  hosting startup page is not mistaken for a healthy server. Render Free can still display
  its startup screen on a full refresh; always-on hosting is needed to prevent idle sleep.

## Session expiry

```ini
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_MINUTES=10080
REFRESH_TOKEN_EXPIRE_DAYS=7
```

`REFRESH_TOKEN_EXPIRE_MINUTES` takes precedence; days is a compatibility fallback when minutes is
not set. `10080` minutes equals seven days. Restart the backend after changes; existing tokens
keep their original expiry until login/refresh.

Settings > Security > **Session & security** shows a live access-token countdown and **Session expiry**,
the actual refresh-cookie expiry (seven days with the configuration above), not the shorter access-token date.
A banner appears at the top during the last five minutes of access-token validity with
**Refresh session** and dismiss controls. Access expiry automatically attempts renewal; ordinary
401 responses also renew and replay through the same shared refresh request. A network/server
failure does not log the user out; an explicitly rejected refresh requires signing in again.
Refresh rotation starts a new refresh lifetime (seven days by default).

`GET /api/v1/auth/session` restores expiry metadata on reload without rotating the session.
Login, refresh and session responses expose only timestamps alongside the public user, never
the HttpOnly cookie values. Browser time differences are accounted for using server time.

## Admin Pro access and live totals

Admin > Users has a gift action to **Grant Pro** (or **Extend Pro**). After confirmation,
`POST /api/v1/admin/users/{id}/pro` grants the configured `PRO_DAYS`, extending any unexpired Pro
access. It creates a complimentary subscription and user notification, and logs the acting admin.
It does not create an order, payment or invoice. Only admins can use this endpoint.

Lists, dashboard totals, auto-apply usage, billing and admin counters refresh after successful
changes, including deletions. Other tabs in the same browser receive a refresh signal; visible
pages also refresh on focus and every 30 seconds to pick up server-side or other-device changes.
Background refreshes preserve filters and unsaved profile, preference and auto-apply controls.

## Loading placeholders

Initial page and settings loads show the original RCA-style soft-pulse placeholders for lists, tables, cards,
forms and dashboard charts. They are replaced by the real content (or empty state) when requests
finish; fast responses may show them only briefly. Background polling keeps already loaded content
visible instead of replacing it with placeholders. Reduced-motion preferences disable shimmer
animation, and screen readers receive a loading status rather than decorative placeholder shapes.

## Device sign-in (passkeys)

After activation, Settings > Security > **Biometric & device sign-in** lets users enroll a passkey.
Adding or removing a device requires a current TOTP code. Enrollment asks the browser for a
user-verified discoverable platform credential; supported phones may use Face ID, fingerprint
or their screen-lock PIN. The OS decides the unlock method: the application cannot force a
fingerprint, and biometric data never reaches the backend.

Enrolling opts the current browser into device sign-in by default; the toggle can turn that
preference off. The sign-in page always retains **Use authenticator code instead**. Passkeys
can be synced by the user's OS/password manager; they are not guaranteed to stay on one physical
device. User-specific credential records and single-use, five-minute challenges are stored
in the database. Signatures, origin, RP ID, user verification and applicable counters are verified.
Admin TOTP resets also revoke passkeys and pending enrollment challenges.

If device sign-in fails, the login page displays the error in a help popup with passkey
enrollment steps, same-domain guidance and a **Use authenticator code** button. That button
switches back to the existing login form without navigating away or clearing entered values.
Closing the popup leaves the error visible and allows another device sign-in attempt.

Passkeys require HTTPS, except trusted localhost development origins. Defaults support the
frontend at `http://localhost:5173`. For another development port or hostname, set
`WEBAUTHN_ORIGIN` and `WEBAUTHN_RP_ID` explicitly. On Render, the trusted
`RENDER_EXTERNAL_URL` supplies the default origin and hostname; custom domains require explicit
configuration. Never derive these values from arbitrary request headers.

## Guide

The header **Guide** button opens a keyboard-accessible spotlight walkthrough for the current page.
Dashboard, jobs, applications, auto-apply, connections, billing and each admin tab have distinct
instructions. Settings has its own Guide button for Profile, Security, Preferences or Shortcuts; onboarding
offers a manual guide without consuming automatic displays. `/guide` is a directory with one entry
per topic, sourced from the same guide definitions rather than duplicating walkthrough text.
The walkthrough automatically opens on the first two signed-in workspace
visits per account (including a full reload), not twice on every browser or page. The count is
persisted in the database, and manual replays do not consume additional automatic displays.
Onboarding remains separate and can be completed or skipped before the workspace guide appears.

## Public website

`/` is the public JobPilot landing page, with features, workflow, an interactive workspace preview,
security information, plan summaries, FAQs and Log in / Sign up links. Its responsive dark-and-gold
design includes scroll reveals, floating accents and an animated activity chart; reduced-motion
preferences disable animations and keep all content visible. The full footer links to the developer's
LinkedIn, GitHub, Medium and profile. Developer links, contact information and copyright appear
only on the homepage, not on authentication, onboarding or signed-in pages.
Signed-in visitors can open their dashboard from the same page. Authentication remains at
`/login` and `/signup`; protected routes still require a session. Preview jobs are illustrative,
not real listings. Marketing copy describes current capabilities, including the external-application
limitation, rather than promising submission on third-party websites.
Both authentication pages use the full screen width with fluid gutters shared by the header.
Laptops and desktops place branding on the left and a viewport-scaled form on the right, rather
than capping the whole page inside a centered container. Tablets and phones use a single-column
form; form widths remain bounded for readability. The page follows the available viewport height,
and short screens and authenticator setup scroll naturally without clipping.
Page headings and signup progress steps are centered within the form card; field labels stay left-aligned.

## Shared appearance

The public site, authentication, onboarding, workspace, settings and admin pages share the dark
ink surfaces, champagne accents, editorial headings and responsive controls. Champagne is the
default accent; existing per-user colour choices are preserved and can be changed in Profile.
Pages use the available screen width with responsive gutters rather than fixed centered page caps.
Workspace navigation contains the main application routes; profile, security, preferences and
shortcuts are available from the header settings button. Security groups email verification,
TOTP information, live session details and device passkeys. The Guide button still provides
contextual help and a link to the guide directory. Workspace pages show real account data rather
than repeating the illustrative marketing demo.

Dashboard and application date filters have labeled date inputs, immediate presets, an explicit
**Apply** button for custom ranges and a clear control. Invalid or future ranges cannot be applied.
Jobs, applications and admin lists share labeled filter groups, selected-state chips, result
summaries and **Clear filters**. On phones, chip groups become compact native selects.
Search and non-date filters still update automatically; background refreshes retain selections.
Admin user filters give Account status its own full-width row below Search users and Role;
Add user stays in the filter header so it does not crowd or misalign the filter controls.

Page and tab entrances do not replay on background data refreshes. Reduced-motion preferences
disable CSS animation and smooth scrolling throughout the app, and pause the authentication
background's SVG animation, including when that preference changes while the page is open.
The installed app and offline fallback use the same dark surface colour.

## Mobile checkout

On phones, Plans checkout offers a generic UPI app chooser and app-specific shortcuts (Google Pay,
PhonePe and Paytm on Android; Google Pay on iOS). Links preserve the server-issued payee, exact
amount, currency and note. They depend on installed apps, browser support and the provider accepting
the payment; the website cannot reliably detect installed UPI apps. A collapsible QR remains available
for another device. Desktop checkout continues to show its QR.

After paying, return to JobPilot. Checkout polls every five seconds and checks again on focus or
visibility restoration. Errors remain visible while polling retries. No deep-link navigation or
client callback marks an order paid: existing bank-credit verification remains authoritative.

## Product feedback

Signed-in users can choose **Share feedback** in the navigation (inside Menu on phones), give a
1-5 star rating and optionally leave up to 2,000 characters. Submissions store the authenticated user,
page pathname (not query parameters), time and review status. Administrators can use
**Admin > Feedback** to page through submissions, filter New / Reviewed and change review status.
User deletion cascades to feedback. New tables are created by startup initialization and receive
the same PostgreSQL RLS protection as other private tables.
