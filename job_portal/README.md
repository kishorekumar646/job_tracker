# Inspector RCA System

A full-stack **Root Cause Analysis (RCA)** platform for the Inspector QA automation pipeline. The backend analyses test failure records from Elasticsearch, classifies them using a pluggable rule engine, cross-references open Jira tickets, and publishes structured verdicts back through RabbitMQ/Logstash. The frontend provides a React dashboard for triggering analyses, viewing results, and monitoring service health.

**Supported platforms:** STB · Perseus Android · Perseus iOS · Perseus Web · BrowserStack

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Backend Design](#backend-design)
- [Frontend Design](#frontend-design)
- [End-to-End Data Flow](#end-to-end-data-flow)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Configuration](#configuration)
- [InspectorWeb Report Fetch Performance](#inspectorweb-report-fetch-performance)
- [Running the System](#running-the-system)
- [Running Tests](#running-tests)
- [Error Handling](#error-handling)
- [Authentication Flow](#authentication-flow)
- [API Quick Reference](#api-quick-reference)
- [Environment Variables](#environment-variables)
- [Network Requirements](#network-requirements)

---

## Architecture Overview

```
╔══════════════════════════════════════════════════════════════════╗
║              FRONTEND  ·  Browser (port 3000)                    ║
║          React 18 + TypeScript + Vite + Tailwind CSS             ║
║                                                                  ║
║  Pages                         State & Transport                 ║
║  ─────────────────────────     ──────────────────────────────    ║
║  AnalyzePage   — run UUID      Zustand authStore (user/role)     ║
║  DashboardPage — stats/charts  HttpOnly cookies (access/refresh) ║
║  VerdictsPage  — job results   Axios + silent refresh interceptor║
║  JobHistoryPage— DB-backed API  SSE ReadableStream (terminal log) ║
║  AdminPage     — admin console useJobPolling (3 s interval)      ║
║  HealthPage    — dep status    useFeedbackPrompt (daily modal)   ║
║  LoginPage / SignupPage                                          ║
╚══════════════════════╤═══════════════════════════════════════════╝
                       │  HTTP + SSE  (Vite proxy /api → :8000)
╔══════════════════════▼═══════════════════════════════════════════╗
║              BACKEND  ·  FastAPI Service (port 8000)             ║
║                       Python 3.11 · Uvicorn                      ║
║                                                                  ║
║  Routers                        Services                         ║
║  ──────────────────────────     ──────────────────────────────   ║
║  /auth/*          — JWT auth    ES Client (ODH failure fetch)    ║
║  /rca/*           — analyze     Rule Engine (pluggable modules)  ║
║  /health          — dep ping    Known Issue Matcher (Jira JQL)   ║
║  /admin/*         — user mgmt   Verdict Aggregator               ║
║  /feedback/*      — ratings     Notification / Announce system   ║
║  /notifications/* — inbox       Shared Report (public HTML)      ║
║  /regression/*    — run mgmt    InspectorWeb Client (run data)   ║
║  Auth Layer                     MQ Publisher → RabbitMQ          ║
║  ──────────────────────────     Sinks: Elastic + Jira comment    ║
║  SQLite/PostgreSQL (users,                                       ║
║    refresh tokens, jobs)        Job Store (DB-backed async)      ║
║  Redis (JWT blocklist +                                          ║
║    presence / in-mem fallback)  Platform Detector                ║
╚══════════════════════╤═══════════════════════════════════════════╝
                       │  VPN / Internal Lab Network
        ┌──────────────┼──────────────────────────────┐
        ▼              ▼                              ▼
  Elasticsearch    RabbitMQ                    Jira Injector
  (ODH) — pull     (publish → Logstash)        (JQL cross-ref)
  failure records  verdict pipeline            known issues
        │
        ▼
  InspectorWeb  — PRIMARY source for sync (runUuid) analysis
  run summaries & per-target mochawesome reports
  REST · Inspector-User header auth · :3000
```

### Frontend Components

| Component | Technology | Role |
|---|---|---|
| **AnalyzePage** | React, SSE `ReadableStream` | Submit run UUID / time-window analysis; stream server logs to browser terminal; 6-step progress bar with per-step elapsed times (persisted in Zustand across navigation and browser refresh) |
| **DashboardPage** | Recharts (Pie + Bar) | Aggregate stats — failure categories, platform breakdown, recent verdicts |
| **VerdictsPage** | React, `useJobPolling` | Display job results with charts and per-failure verdict list; polls every 3 s |
| **JobHistoryPage** | React, DB-backed API | Reverse-chronological history of all analyses; pagination, status filters, sort; Verdicts column shows count + total duration e.g. `60 (2m 21s)`; auto-refreshes every 15 s when jobs are RUNNING/PENDING; manual Refresh button with shimmer feedback |
| **AdminPage** | React, Axios | Admin-only console with six tabs: **Users** (create/edit/delete accounts — Create button enabled only when email is a valid @infosys.com address; set roles, reset TOTP, manage permissions, live presence status), **Job History** (browse any user's analysis history), **Feedback** (user satisfaction ratings with search + filter), **Rules** (per-rule hit counts, feedback tallies, and confidence override), **Announce** (broadcast to all active users), **Regression** (run configs and scheduled runs across the team) |
| **RegressionPage** | React, InspectorWeb API | Full regression run workflow — browse test-case files, configure STB/OTT device selectors and OTT provisioning, set Xray JQL queries, create/edit/duplicate/delete run configs, trigger runs, monitor live status, view per-target mochawesome report summaries and log tails, manage cron/continuous/once schedules, and hand finished runs to the RCA pipeline |
| **HealthPage** | Axios | Live connectivity status for ODH, Jira, RabbitMQ, and InspectorWeb |
| **Auth pages** | Zustand, Axios | TOTP login / signup; silent token refresh via response interceptor |
| **Axios client** | `api/client.ts` | Intercepts 401 → `POST /auth/refresh` → replay; clears auth on failure |

### Backend Components

| Component | Technology | Role |
|---|---|---|
| **Auth Router** | FastAPI, pyotp | TOTP setup, QR generation, account activation, login, refresh, logout, `GET /auth/me` (returns email, full_name, role, date_of_birth, permissions), `PATCH /auth/me` (update full_name and/or date_of_birth) |
| **RCA Router** | FastAPI, SSE | `POST /rca/analyze` — sync (runUuid) and async (time-window) paths; SSE log stream; job history, stats, verdicts, cancel, feedback; shared report generation |
| **Health Router** | FastAPI, httpx | Pings ODH, Jira, RabbitMQ, InspectorWeb; returns per-service status |
| **Admin Router** | FastAPI | User CRUD, role/status management, TOTP reset, live config status, rule confidence override |
| **Feedback Router** | FastAPI, SQLAlchemy | `POST /feedback` (submit rating), `GET /feedback` (admin list), `GET /feedback/stats` (aggregate stats) |
| **Notifications Router** | FastAPI, SQLAlchemy | Per-user inbox (`/mine`); mark read; `POST /announce` (admin broadcast); announcement history + recipients; announcement preference opt-out |
| **Regression Router** | FastAPI, SQLAlchemy | Full InspectorWeb regression run lifecycle — run config CRUD, run triggering and live status, per-target report/log endpoints, schedule management (cron/continuous/once), batch analysis preview, and a dashboard summary. Permissions: `regression.view` / `regression.run` |
| **ES Client** | elasticsearch-py async | Fetches `FailureRecord` documents by run UUID, test name, or time window |
| **Rule Engine** | Pure Python | Loads platform-specific rule modules; first-match-wins evaluation |
| **InspectorWeb Client** | httpx async | Fetches run summaries and per-target mochawesome reports; 3 s connect timeout; `get_abort_reason_from_targets()` fallback for aborted runs whose run-level error field is just `"true"` |
| **Known Issue Matcher** | httpx, regex | Direct Jira link → ticket fetch; fallback fingerprint JQL search |
| **Verdict Aggregator** | Pure Python | Merges rule output + Jira match → `RcaVerdict` with category, confidence, explanation |
| **MQ Publisher** | aio-pika | Publishes verdicts to RabbitMQ exchange for Logstash ingestion |
| **Job Store** | SQLAlchemy async, SQLite | Persists `PENDING → RUNNING → DONE / FAILED` state for async jobs in the `analysis_jobs` DB table; survives server restarts |
| **Log Stream** | asyncio, in-memory queue | Per-session log buffer; SSE endpoint drains it so browser terminal receives real-time server logs |
| **Rule Confidence** | SQLAlchemy async | Tracks per-rule hit counts and feedback tallies; computes effective confidence; supports admin confidence overrides |
| **Auth DB** | SQLAlchemy async | SQLite (default) / PostgreSQL — users, refresh tokens, OTP records |
| **Redis** | redis-py async | JWT blocklist with TTL + user presence tracking (`last_seen:<email>`, TTL 3600 s); in-memory fallback for both if Redis is absent |

### Component Responsibilities

| Component | Technology | Role |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind, Recharts | Interactive dashboard — submit analyses, view verdicts, monitor health |
| **API Service** | FastAPI, Python 3.11, Uvicorn | REST API, TOTP auth, RCA orchestration, admin user management |
| **Rule Engine** | Pure Python (pluggable modules) | Classifies failures by platform-specific patterns |
| **Elasticsearch (ODH)** | Internal lab service | Source of test failure records |
| **RabbitMQ** | Internal lab broker | Verdict publishing via Logstash pipeline |
| **Jira Injector** | Internal HTTP proxy | Known-issue cross-referencing via JQL |
| **SQLite / PostgreSQL** | SQLAlchemy async | Auth database (users, refresh tokens) |
| **Redis** | Optional | JWT revocation blocklist + user presence (`last_seen`) (in-memory fallback if absent) |

---

## Backend Design

### Directory Structure

```
rca_service/
├── logs/                           # Daily rotating log files (DD-MM-YYYY.log); auto-created on first run
├── app/
│   ├── main.py                     # App entrypoint re-export for uvicorn
│   ├── __init__.py                 # App factory, lifespan, router mounts, CORS; _DailyFileHandler logging setup
│   ├── models.py                   # Core Pydantic models (FailureRecord, RcaVerdict, AnalyzeRequest/Response, JobStatus); extract_error_text()
│   ├── auth/
│   │   ├── router.py               # Endpoints: signup, totp/qr, activate, login, refresh, logout, me
│   │   ├── service.py              # Business logic: TOTP setup, activation, login, token rotation
│   │   ├── models.py               # SQLAlchemy ORM: User, RefreshToken, OTPRecord
│   │   ├── schemas.py              # Request/response Pydantic schemas
│   │   ├── dependencies.py         # FastAPI DI: AccessTokenBearer, RefreshTokenBearer, RoleChecker
│   │   └── utils.py                # Token decode and validation helpers
│   ├── core/
│   │   ├── config.py               # Pydantic BaseSettings — all env vars with Field descriptions
│   │   ├── db.py                   # Async SQLAlchemy engine and session factory
│   │   ├── redis.py                # Redis client + in-memory blocklist fallback
│   │   ├── security.py             # JWT creation (access + refresh), HS256 signing
│   │   ├── errors.py               # Custom exception hierarchy and handlers
│   │   ├── middleware.py           # CORS configuration
│   │   └── docs.py                 # Fully custom Swagger UI — tag-nav, animated workflow, role-aware Admin tab
│   ├── routers/
│   │   ├── rca.py                  # POST /rca/analyze, GET /rca/stream/{sid}, GET /rca/history, GET /rca/stats, GET /rca/verdicts/{id}, GET /rca/verdicts/by-run/{uuid}, GET /rca/history/{uid}/verdicts, DELETE /rca/history/{uid}, POST /rca/jobs/{id}/cancel, POST /rca/verdicts/feedback, GET /rca/admin/history, GET /rca/admin/history/{uid}/verdicts, GET /rca/reports/by-run/{uuid}, POST /rca/reports/share/{uid}, GET /rca/reports/view/{id} (public), GET /rca/admin/reports/view/{id}
│   │   ├── health.py               # GET /health — pings ODH, Jira, RabbitMQ, InspectorWeb
│   │   ├── admin.py                # GET /admin/config, POST/GET /admin/users, PATCH/DELETE /admin/users/{id}, GET /admin/rules/stats, PATCH /admin/rules/{name}/confidence
│   │   ├── feedback.py             # POST /feedback, GET /feedback (admin), GET /feedback/stats (admin)
│   │   └── notifications.py        # GET /notifications/mine, PATCH /{id}/read, POST /mark-all-read, PATCH /preferences, POST /announce (admin broadcast), GET/DELETE /announcements (admin), GET /announcements/recipients (admin)
│   ├── services/
│   │   ├── es_client.py            # Elasticsearch queries (by run UUID, test case name, time window)
│   │   ├── rule_engine.py          # Loads rule modules, first-match-wins evaluation
│   │   ├── inspectorweb_client.py  # InspectorWeb REST client; get_abort_reason_from_targets() fallback lookup
│   │   ├── known_issue_matcher.py  # Jira fingerprint search + direct link resolution
│   │   ├── jira_client.py          # Jira Injector HTTP wrapper (JQL search, issue fetch)
│   │   ├── platform_detector.py    # Maps runInfo/deviceInfo → Platform enum
│   │   ├── verdict_aggregator.py   # Merges rule finding + Jira match into RcaVerdict
│   │   ├── job_store.py            # DB-backed async job state (AnalysisJob table: PENDING → RUNNING → DONE/FAILED)
│   │   ├── log_stream.py           # Per-session asyncio queue; drained by GET /rca/stream/{session_id} SSE endpoint
│   │   ├── rule_confidence.py      # Per-rule hit counts, feedback tallies, effective confidence, admin overrides
│   │   ├── mq_publisher.py         # RabbitMQ singleton connection, verdict publishing
│   │   └── rmq_fetcher.py          # RMQ-proxied ODH fetcher (used when USE_RMQ_FETCHER=true)
│   ├── sinks/
│   │   ├── elastic_sink.py         # Publishes verdicts to Elasticsearch via MQ pipeline
│   │   └── jira_comment_sink.py    # Posts RCA summary comment on matched Jira ticket
│   └── rules/
│       ├── stb/
│       │   ├── cs_error_lookup.py
│       │   └── xap_call_failed.py
│       ├── perseus_android/
│       │   └── playout_error_lookup.py
│       ├── perseus_ios/
│       │   └── playout_error_lookup.py
│       ├── perseus_web/
│       │   └── playout_error_lookup.py
│       ├── browserstack/
│       │   ├── plan_limit.py
│       │   ├── session_not_created.py
│       │   ├── appium_timeout.py
│       │   └── web_playout_error_lookup.py
│       └── common/
│           ├── no_devices_available.py
│           ├── no_test_data_found.py
│           ├── http_service_error.py
│           ├── rmq_rpc_timeout.py
│           ├── return_to_live_tv_failed.py
│           ├── personal_home_navigation_failed.py
│           ├── inspector_session_terminated.py
│           ├── required_assertion_failed.py
│           ├── perseus_error.py
│           ├── js_runtime_error.py
│           ├── element_not_found.py
│           └── assertion_failure.py
├── tests/
└── tools/
```

### Core Data Models

```
FailureRecord
  ├── testCaseRunId: str
  ├── fullTitle: str
  ├── platform: str
  ├── runInfo: dict          ← metadata, platformType, boxType
  ├── activeDevice: dict     ← device/browser info
  ├── err: dict              ← message, stack, response
  ├── jiraLink: str | None
  └── timestamp: datetime

RcaVerdict
  ├── testCaseRunId: str
  ├── platform: Platform
  ├── category: RcaCategory  ← DRM_ERROR | PLAYOUT_ERROR | ENVIRONMENT |
  │                             BROWSERSTACK_CAPACITY | ORCHESTRATION |
  │                             LOGIC_BUG | KNOWN_ISSUE | UNKNOWN
  ├── confidence: float       ← 0.0 – 1.0
  ├── explanation: str
  ├── matchedRule: str | None
  └── matchedJiraTicket: str | None
```

### RCA Pipeline

The single `POST /rca/analyze` endpoint handles both execution modes:

```
AnalyzeRequest
  ├── runUuid?          →  SYNC  (returns verdicts inline, HTTP 200)
  └── testCaseName?
      sinceMinutes?     →  ASYNC (returns jobId, HTTP 202; results polled separately)
      sinceDays?
      platform?
```

**Synchronous path:**

```
Fetch by run UUID (ES)
    └─► For each FailureRecord (parallel asyncio.gather):
            ├─ rule_engine.evaluate()          → category, confidence, matchedRule
            ├─ known_issue_matcher.find()      → matchedJiraTicket | None
            └─ verdict_aggregator.aggregate()  → RcaVerdict
    └─► elastic_sink.publish(verdicts)
    └─► jira_comment_sink.comment()  (if KNOWN_ISSUE + RCA_JIRA_COMMENT_ENABLED=true)
    └─► return verdicts (HTTP 200)
```

**Asynchronous path:**

```
Create job (PENDING) → return jobId (HTTP 202)
    └─► BackgroundTask:
            Set RUNNING
            Fetch by window / test case name (ES)
            Run same pipeline (parallel)
            Publish to RabbitMQ
            Set DONE + store verdicts + summary
```

### Rule Engine

Each rule module exposes two functions with an identical interface:

```python
def matches(failure: FailureRecord) -> bool: ...
def explain(failure: FailureRecord) -> dict:
    return {"category": "ENVIRONMENT", "confidence": 0.8,
            "explanation": "...", "matchedRule": "stb.xap_call_failed"}
```

Evaluation order: **platform-specific rules first → common rules → UNKNOWN fallback**.
First matching rule wins. New rules are added by creating a module and registering it in `rule_engine.py`.

| Platform | Rule | Category |
|---|---|---|
| STB | `cs_error_lookup` | ENVIRONMENT |
| STB | `xap_call_failed` | ENVIRONMENT |
| PERSEUS_ANDROID | `playout_error_lookup` | PLAYOUT_ERROR / DRM_ERROR |
| PERSEUS_IOS | `playout_error_lookup` | PLAYOUT_ERROR / DRM_ERROR |
| PERSEUS_WEB | `playout_error_lookup` | PLAYOUT_ERROR / DRM_ERROR |
| BROWSERSTACK | `plan_limit`, `session_not_created`, `appium_timeout` | BROWSERSTACK_CAPACITY |
| BROWSERSTACK | `web_playout_error_lookup` | PLAYOUT_ERROR |
| Common | `no_devices_available` | ENVIRONMENT |
| Common | `no_test_data_found` | ENVIRONMENT |
| Common | `http_service_error` | ENVIRONMENT |
| Common | `rmq_rpc_timeout` | ENVIRONMENT |
| Common | `return_to_live_tv_failed` | ENVIRONMENT |
| Common | `personal_home_navigation_failed` | ENVIRONMENT |
| Common | `inspector_session_terminated` | ENVIRONMENT |
| Common | `required_assertion_failed` | LOGIC_BUG |
| Common | `perseus_error` | PLAYOUT_ERROR |
| Common | `js_runtime_error` | LOGIC_BUG |
| Common | `element_not_found` | LOGIC_BUG |
| Common | `assertion_failure` | LOGIC_BUG |

### InspectorWeb Report Fetch Performance

The `inspectorweb_client` fetches per-target mochawesome JSON reports in parallel (concurrency = 20). Fetch duration scales directly with payload size because the lab server delivers at roughly **90–150 KB/s**. Observed timings from 2026-09-16 across 94 reports:

| Report size | Avg fetch time | Typical count |
|---|---|---|
| < 500 KB | ~2.5 s | rare |
| 500 KB – 1 MB | ~6 s | common |
| 1 – 2 MB | ~10 s | most common (56 % of reports) |
| 2 – 5 MB | ~20 s | occasional |
| > 5 MB | ~60 s | rare; worst case 97.7 s for a 14.7 MB file |

**Root causes for slow individual reports:**
- Large payload — reports with many steps or embedded screenshots routinely exceed 1–2 MB.
- No response compression — the `results_report/*.json` endpoint does not appear to send gzip/brotli, so raw bytes are transferred.
- Low lab server throughput — unrelated to local network speed.

**Mitigation already in place:** parallel fetching (concurrency = 20) keeps overall wall time manageable even when individual reports are slow. Adding `Accept-Encoding: gzip` to the request headers would be the highest-impact single change if the server supports it.

### Daily Log Files

All application logs are written to `logs/DD-MM-YYYY.log` in the `rca_service/` directory. A new file is opened automatically at midnight without any process restart — the `_DailyFileHandler` class in `app/__init__.py` checks the current date on every log `emit()` and rotates to a fresh file when the date changes.

Each log line follows the format:

```
2026-09-03 14:22:05 | INFO     | app.routers.rca | Starting analysis for run 550e8400-...
```

The `logs/` directory is created automatically if it does not exist. Log files are never deleted automatically — archive or purge old files according to your retention policy.

### Known-Issue Matching

Two strategies, tried in order:

1. **Direct link** — if `failure.jiraLink` is present, extract ticket key with regex `[A-Z][A-Z0-9]+-\d+`, fetch via Jira Injector, return ticket if status is open (Open / In Progress / Reopened / To Do / In Review).
2. **Fingerprint search** — strip UUIDs, hex strings, timestamps, and lone numbers from `err.message`, build JQL:
   ```
   project is not EMPTY AND status in (...open statuses...)
   AND text ~ "<fingerprint>" AND labels = "<platform>"
   ```
   Returns first matching Jira key, or `None`.

Verdict priority: `KNOWN_ISSUE (confidence 1.0)` > rule match > `UNKNOWN (confidence 0.0)`.

### Authentication System

TOTP-based two-factor auth. Only `@infosys.com` addresses are accepted.

Tokens are delivered as **HttpOnly cookies** (`access_token` + `refresh_token`) — they are never exposed in the response body or readable by JavaScript. Role-based access control is enforced via the `RoleChecker` dependency.

**Database tables (SQLAlchemy async, SQLite default):**

| Table | Key columns |
|---|---|
| `users` | email (unique), full_name, totp_secret, is_active, role (`user` \| `admin`), date_of_birth, dob_update_count, receive_announcements, permissions (JSON list of granted permission keys) |
| `refresh_tokens` | user_id FK, jti (unique), expires_at, is_revoked |
| `otp_records` | user_id FK, used_at (rate-limiting hook) |
| `analysis_jobs` | uid (unique), user_email, status (`PENDING`\|`RUNNING`\|`DONE`\|`FAILED`), run_uuid, verdicts JSON, summary JSON, execution_name, cancel_reason, duration_secs, created_at, updated_at |
| `rule_stats` | rule_name (unique), hit_count, correct_count, incorrect_count, static_confidence, confidence_override |
| `feedback` | user_id FK, user_email, full_name, rating (1–5), comment, created_at |
| `shared_reports` | id (UUID PK), analysis_uid, created_by (email), creator_role, job_owner_email, created_at |
| `user_notifications` | id, recipient_email, sender_email, sender_name, notif_type (`dashboard_view`\|`report_view`\|`announcement`), job_uid, message, is_read, created_at |
| `regression_runs` | id, run_uuid, run_config_uuid, name, triggered_by_email, stopped_by_email, inspector_username, phase, last_status (JSON), finished_at, schedule_uuid, error, created_at |
| `regression_schedules` | id (PK), uuid (unique), owner_email, inspector_username, name, type (cron/continuous/once), cron, mode, enabled, status, run_configs_json, when_json, until_json, labels_json, next_run_at, executions, day_executions, active_json, last_error, stop_reason, created_at, updated_at |

**Token lifecycle:**

```
POST  /auth/signup   → totp_setup() → store TOTP secret → return QR URL
    ↓
GET   /auth/totp/qr  → generate PNG from provisioning URI
    ↓
POST  /auth/activate → pyotp.TOTP().verify(otp) → set user.is_active = True
    ↓
POST  /auth/login    → verify TOTP → set HttpOnly cookies:
                        access_token  (120 min)
                        refresh_token (7 days)
    ↓
GET   /auth/me       → return current user (email, full_name, role, created_at, date_of_birth, permissions) — reads from DB
PATCH /auth/me       → update full_name (max 15 chars) and/or date_of_birth (max 2 updates); returns updated UserMeResponse
    ↓
POST  /auth/refresh  → validate refresh cookie → revoke old JTI → issue new cookie pair
    ↓
POST  /auth/logout   → blocklist access JTI (Redis/TTL) → revoke all refresh tokens → clear cookies
```

Token revocation is tracked in **Redis** (TTL = token expiry). If Redis is unavailable the service falls back to an in-memory set automatically — auth still works but the blocklist is lost on restart.

### Admin System

All `/admin/*` endpoints require the `admin` role (enforced by `RoleChecker(["admin"])`).

The **AdminPage** (`/admin`) in the frontend exposes these capabilities across five tabs:

| Tab | Description |
|---|---|
| **Users** | Create, edit, deactivate, and delete user accounts; change roles; reset TOTP (forces re-scan); live online/away/offline presence status |
| **Job History** | Browse any user's analysis history by email with date-range filter; expand entries to view verdicts |
| **Feedback** | View user satisfaction ratings; search by user; filter by rating; sortable table |
| **Rules** | Per-rule hit counts, feedback tallies, static vs effective confidence; manual confidence override (0.0–1.0 or clear) |
| **Announce** | Broadcast an announcement to all active users; message delivered instantly to each user's notification inbox; history with per-recipient delivery status |

#### User management

| Endpoint | Description |
|---|---|
| `GET  /admin/config` | Live config status — shows each env var, its current value, description, and whether it is still at its compile-time default |
| `POST /admin/users` | Create a new user account and return its TOTP QR URL |
| `GET  /admin/users` | List all registered users (ordered by creation date) |
| `PATCH /admin/users/{id}/role` | Change a user's role (`user` \| `admin`) |
| `PATCH /admin/users/{id}/status` | Toggle `is_active` on/off |
| `PATCH /admin/users/{id}/full-name` | Set or clear a user's display name |
| `PATCH /admin/users/{id}/dob` | Set or clear date of birth (admin bypass — does not increment DOB update count) |
| `GET  /admin/permissions` | Return the full permission registry (keys + labels + implications) |
| `PATCH /admin/users/{id}/permissions` | Replace a user's granted permission keys (unknown keys rejected with 422) |
| `POST /admin/users/{id}/reset-totp` | Wipe TOTP secret, deactivate account, revoke all sessions |
| `DELETE /admin/users/{id}` | Permanently delete a user and all related records |

#### Rule confidence

| Endpoint | Description |
|---|---|
| `GET  /admin/rules/stats` | Return all rule stats — hit counts, correct/incorrect feedback tallies, static confidence, effective confidence |
| `PATCH /admin/rules/{rule_name}/confidence` | Set a manual confidence override (0.0–1.0); send `null` to clear and revert to feedback-computed value |

### RCA Endpoints

Full endpoint list for the `/rca/*` router (all require auth; admin-prefixed routes additionally require the `admin` role):

| Endpoint | Description |
|---|---|
| `POST /rca/analyze` | Sync (runUuid) or async (time-window / test case name) RCA — see pipeline above |
| `GET  /rca/stream/{session_id}` | SSE log stream; drains the per-session log queue in real time to the browser terminal |
| `GET  /rca/history` | Current user's DB-backed job history; supports `from_date`, `to_date`, `page`, `page_size` |
| `GET  /rca/stats` | Dashboard aggregate stats (category breakdown, platform breakdown) for a date range |
| `GET  /rca/verdicts/{job_id}` | Job status + verdicts for a specific async job |
| `GET  /rca/verdicts/by-run/{run_uuid}` | All verdicts stored against a specific run UUID |
| `GET  /rca/history/{uid}/verdicts` | Verdicts for a specific history entry (own jobs only) |
| `DELETE /rca/history/{uid}` | Delete a history entry (own jobs only) |
| `POST /rca/jobs/{job_id}/cancel` | Cancel a RUNNING or PENDING job |
| `POST /rca/verdicts/feedback` | Submit correct/incorrect feedback for a rule match |
| `GET  /rca/admin/history` | Admin: browse any user's job history by email |
| `GET  /rca/admin/history/{uid}/verdicts` | Admin: verdicts for any user's history entry |
| `GET  /rca/reports/by-run/{run_uuid}` | Raw InspectorWeb mochawesome report for a run UUID |
| `POST /rca/reports/share/{uid}` | Create (or fetch existing) a shareable public report link for a DONE job |
| `GET  /rca/reports/view/{report_id}` | **Public** — serve the shared report as a self-contained HTML page (no login required) |
| `GET  /rca/admin/reports/view/{uid}` | Admin: view the enhanced RCA report for any job |

### Regression Endpoints

All `/regression/*` endpoints require authentication. Create/trigger/edit/delete operations additionally require the `regression.run` permission; read endpoints require `regression.view`. Non-admins only see and run their own run configs.

#### Lookups

| Endpoint | Description |
|---|---|
| `GET  /regression/meta` | InspectorWeb version, environment, branch list, and timeout options |
| `GET  /regression/test-cases` | Search test-case files on a branch (`branch`, `q`, `limit` params) |
| `POST /regression/test-cases/preview` | Preview the Xray tickets an Xray JQL query selects (read-only) |
| `GET  /regression/x-test-executions` | Search Xray Test Execution keys (30-min client cache) |
| `GET  /regression/mocha-hooks` | Hook names per phase on a branch |
| `GET  /regression/ott-options` | Known values for OTT device selectors |
| `GET  /regression/app-versions` | OTT app versions per lab (for provisioning) |
| `POST /regression/targets/match` | Devices a selector group resolves to (read-only preview) |
| `GET  /regression/targets` | List STB or OTT devices (`type=stb|ott`, paginated) |

#### Run Configs

| Endpoint | Description |
|---|---|
| `GET  /regression/run-configs` | Saved run configs (own only; admin + `all=true` sees all) |
| `GET  /regression/run-configs/filter-options` | Autocomplete values for name / label / username filter columns |
| `GET  /regression/run-configs/{uuid}` | One saved run config (own only unless admin) |
| `GET  /regression/run-configs/{uuid}/raw` | Full raw InspectorWeb run config (for download / edit / duplicate) |
| `POST /regression/run-configs` | Create a run config in InspectorWeb; `execute=true` also triggers it immediately |
| `PUT  /regression/run-configs/{uuid}` | Edit your run config; `execute=true` also triggers it |
| `DELETE /regression/run-configs/{uuid}` | Soft-delete (expire) your own run config |

#### Runs

| Endpoint | Description |
|---|---|
| `POST /regression/runs` | Execute a saved run config — records the run in the app's audit table |
| `GET  /regression/runs` | All runs triggered from this app (optionally filtered by `runConfigUuid`) |
| `GET  /regression/runs/{run_uuid}` | Live run status from InspectorWeb; falls back to last snapshot if unreachable |
| `GET  /regression/runs/{run_uuid}/targets/{target_uuid}/details` | Per-target mochawesome report summary: real status, tags, failed steps, links (cached 30 min) |
| `GET  /regression/runs/{run_uuid}/targets/{target_uuid}/logs` | Live log tail for one device (`kind=log\|error`, `lines`) |
| `POST /regression/runs/{run_uuid}/stop` | Stop a run (owner or admin only) |
| `DELETE /regression/runs/{id}` | Remove a finished run from this app's run lists (owner or admin; running runs must be stopped first) |
| `POST /regression/runs/{run_uuid}/analyze` | Hand the run to the RCA pipeline (calls `POST /rca/analyze` with the run UUID) |

#### Schedules

| Endpoint | Description |
|---|---|
| `GET  /regression/schedules` | Your schedules (run by this app's scheduler) with next-run times and status |
| `POST /regression/schedules` | Create a cron, continuous, or once schedule for your run configs |
| `PUT  /regression/schedules/{uuid}` | Edit your schedule |
| `POST /regression/schedules/{uuid}/enable` | Enable a disabled schedule |
| `POST /regression/schedules/{uuid}/disable` | Disable a schedule |
| `POST /regression/schedules/{uuid}/execute` | Fire the schedule immediately (manual run now) |
| `DELETE /regression/schedules/{uuid}` | Delete your schedule (running jobs continue) |

#### Batch Analysis & Dashboard

| Endpoint | Description |
|---|---|
| `POST /regression/batch/preview` | Preview which of this app's runs a batch analysis would cover (no execution) |
| `GET  /regression/dashboard` | Regression dashboard summary: run counts by state, per-day breakdown, analysis coverage, currently-running runs, and schedule highlights (`from_date`, `to_date`, `scope=me\|all`) |

### Error Handling

All errors surface as structured JSON with an appropriate HTTP status code. Sensitive fields (`JWT_SECRET_KEY`, `REDIS_URL`, `RABBITMQ_URL`, `DATABASE_URL`) are always masked as `***` in the config endpoint.

#### Auth Errors

| Status | Trigger |
|---|---|
| `401` | Invalid or expired JWT access token |
| `401` | Wrong TOTP code / account not yet activated |
| `403` | Non-admin user accessing `/admin/*` routes |
| `409` | Email address already registered |
| `422` | Non `@infosys.com` email · invalid role value |

#### RCA & Infrastructure Errors

| Status | Trigger |
|---|---|
| `503` | InspectorWeb unreachable — VPN not connected (3 s connect timeout); emits a box warning to both server stderr and the SSE terminal |
| `503` | ODH / Elasticsearch unreachable |
| `404` | Run UUID not found in InspectorWeb |
| `SKIP` | Job status is still Running or was Aborted — analysis skipped, no verdict emitted |
| `FAIL` | Unhandled exception in background job → job status set to `FAILED` |

> **VPN detection:** `httpx.ConnectError` and `httpx.ConnectTimeout` (connect timeout = 3 s) both trigger the 503 path. A box warning is written atomically to stderr via `os.write(2, ...)` and also emitted to the SSE stream so both the server terminal and the browser terminal stay in sync.

---

## Frontend Design

### Directory Structure

```
frontend/src/
├── App.tsx                        # BrowserRouter, TourProvider, route table, ProtectedRoute wrappers; RCACategoryBg animated SVG on auth pages
├── types/index.ts                 # Shared TypeScript types (RcaVerdict, JobStatus, Platform, RuleStats, etc.)
├── api/
│   ├── client.ts                  # Axios instance with cookie-based silent refresh interceptor
│   ├── auth.ts                    # signup(), login(), logout(), getMe(), updateProfile()
│   ├── admin.ts                   # listUsers(), createUser(), deleteUser(), toggleStatus(), updateRole(), updateFullName(), resetTotp()
│   ├── feedback.ts                # submitFeedback(), getAdminFeedback(), getFeedbackStats()
│   ├── notifications.ts           # sendAnnouncement(), getAnnouncementHistory(), getAnnouncementRecipients(), deleteAnnouncement(), updateAnnouncementPreference()
│   └── rca.ts                     # analyze(), getJobStatus(), getVerdictsByRun(), getHealth(), getHistory(), getDashboardStats(), deleteHistoryJob(), cancelJob(), getAdminHistory(), submitVerdictFeedback(), getRuleStats(), overrideRuleConfidence(), getHistoryVerdicts(), getAdminHistoryVerdicts(), shareReport()
├── store/
│   ├── authStore.ts               # Zustand: user (email/role/full_name), expiresAt, setSession(), fetchMe(), clearAuth()
│   ├── analyzeStore.ts            # Zustand (persisted): full analysis session state — sessionId, logs, progress (0–100), showProgress, progressStatus, stepDurations, verdicts, jobId, error; survives SPA navigation and browser refresh
│   ├── healthStore.ts             # Zustand: service health state; polled every 30 s from DashboardLayout
│   └── themeStore.ts              # Zustand: active accent colour theme (indigo/violet/teal/rose)
├── hooks/
│   ├── useAuth.ts                 # Auth context helper
│   ├── useJobPolling.ts           # Polls getJobStatus() every 3 s; stops on DONE/FAILED
│   ├── useTokenExpiry.ts          # Watches access token lifetime; triggers refresh-warning banner
│   ├── useOnlineStatus.ts         # Cross-browser offline detection; HEAD /api/v1/health polling fallback for Safari
│   ├── useFeedbackPrompt.ts       # Date-gated daily feedback modal (4–6 PM local time, localStorage gate)
│   ├── useKeyboardShortcuts.ts    # Global keydown listener — OS-aware ⌘/Ctrl nav shortcuts + single-key S / ?
│   ├── useModalEscape.ts          # Shared hook: Esc closes any modal; added to all modal components
│   ├── useServiceAlerts.ts        # Polls health endpoint; surfaces down-service alerts in Header bell
│   ├── useMyNotifications.ts      # Fetches and tracks unread notification inbox count
│   └── useTheme.ts                # Applies CSS accent-colour variables for the active theme; re-runs on user email change so each account's theme loads correctly on login
├── tour/
│   ├── TourContext.tsx            # Guided product tour — auto-shows max 2× per user per page; count in localStorage
│   └── tourSteps.ts               # Per-page step definitions (pageId → TourStep[])
├── pages/
│   ├── auth/
│   │   ├── LoginPage.tsx          # Email + TOTP code form
│   │   └── SignupPage.tsx         # Email form → QR code display → link to login
│   ├── DashboardPage.tsx          # Stats, charts, recent verdicts, health overview
│   ├── AnalyzePage.tsx            # Sync/async mode toggle, submit form, inline results
│   ├── VerdictsPage.tsx           # Job result page — charts, verdict list, dual filters
│   ├── JobHistoryPage.tsx         # All analyses from DB API — pagination, filters, sort, auto-refresh every 15 s
│   ├── AdminPage.tsx              # Admin console — Users / Job History / Feedback / Rules tabs (admin role required)
│   └── HealthPage.tsx             # ODH / Jira / RabbitMQ / InspectorWeb connectivity status
└── components/
    ├── layout/
    │   ├── DashboardLayout.tsx    # Sidebar + header shell; owns SettingsModal state; mounts useKeyboardShortcuts
    │   ├── Sidebar.tsx            # Navigation links, Give Feedback, Contact Developer, Log out
    │   ├── Header.tsx             # Top bar: global search, Guide button, notification inbox, service bell, user profile card (opens Settings)
    │   └── ProtectedRoute.tsx     # Redirects unauthenticated users to /login; enforces requiredRole
    ├── ui/
    │   ├── Button.tsx
    │   ├── Badge.tsx              # Category / platform / status colour badges
    │   ├── StatCard.tsx           # Metric tile (number + label)
    │   ├── LoadingSpinner.tsx
    │   ├── TokenExpiryBanner.tsx  # Banner shown when access token is about to expire; live MM:SS countdown clock (turns red at ≤10 s); offers Refresh / Dismiss
    │   ├── OfflineBanner.tsx      # Network-offline banner with animated indicator and countdown retry
    │   ├── FeedbackModal.tsx      # Daily satisfaction rating modal (1–5 stars + optional comment)
    │   ├── SettingsModal.tsx      # Three-tab modal: Profile (name edit, session expiry), Preferences (theme, default platform, toggles), Shortcuts (OS-aware key reference)
    │   ├── TourGuide.tsx          # Step-by-step guided tour overlay; driven by TourContext
    │   ├── NotificationInbox.tsx  # Dropdown inbox panel — mark read, mark all read
    │   └── CopyText.tsx           # Shared inline copy-to-clipboard component — hover-reveal button, 2 s confirmation flash
    └── charts/
        ├── CategoryDonutChart.tsx # Recharts Pie — failure category distribution
        ├── PlatformBarChart.tsx   # Recharts Bar — platform breakdown
        └── ConfidenceBar.tsx      # Horizontal fill bar, colour-coded 0–100 %
└── utils/
    ├── user.ts                    # getInitials(fullName, email) — shared initials logic used by Header and SettingsModal
    ├── date.ts                    # formatCreatedAt(), toDateStr() — consistent date formatting
    ├── settings.ts                # AppSettings type, getSettings(), saveSettings(), setSettingsUser(email) — per-user localStorage key (rca_settings_<email>) so two accounts on the same machine never share preferences
    └── analyzeSession.ts          # Module-level SSE + progress manager (lives outside React): launchAnalysisSession(), reconnectIfActive(), stopAnalysis(), signalError(); MILESTONES array maps backend log patterns to progress values (0–100); progress ticker fires every 500 ms
```

### Route Table

| Path | Page | Auth |
|---|---|---|
| `/login` | LoginPage | Public |
| `/signup` | SignupPage | Public |
| `/dashboard` | DashboardPage | Protected |
| `/analyze` | AnalyzePage | Protected |
| `/jobs` | JobHistoryPage | Protected |
| `/jobs/:jobId` | VerdictsPage | Protected |
| `/health` | HealthPage | Protected |
| `/admin` | AdminPage | Protected + `admin` role |
| `/*` | → `/dashboard` | — |

### State Management

| Concern | Mechanism |
|---|---|
| Auth user info | Zustand store (`authStore`) — hydrated from `GET /auth/me` on load; tracks `user`, `expiresAt`, `fetchMe()`, `setSession()`, `clearAuth()` |
| Auth tokens | HttpOnly cookies managed entirely by the browser — never in JavaScript |
| App preferences | localStorage keyed **per user** (`rca_settings_<email>`) — theme, default platform, toggles; `setSettingsUser(email)` called in `authStore` on login/logout so two accounts on the same machine never share settings |
| Analysis history | DB-backed API (`GET /rca/history`) — paginated, filterable, sortable; displayed in JobHistoryPage |
| Feedback | `POST /feedback` (user) + `GET /admin/feedback` (admin); daily modal prompt gated by localStorage date |
| Live job status | `useJobPolling` hook — polls `/rca/verdicts/{jobId}` every 3 s |
| Auto-refresh | JobHistoryPage polls every 15 s when any job is RUNNING or PENDING |
| Server state | Direct Axios calls (no React Query in current build) |

### Silent Token Refresh

`api/client.ts` attaches a response interceptor. Because tokens are HttpOnly cookies the browser sends them automatically on every request:

```
Response 401 received
  └─► Not yet retrying? → queue pending requests
          └─► POST /auth/refresh  (browser sends refresh_token cookie automatically)
                  ├─► Success → new cookie pair set by server → replay all queued requests
                  └─► Failure → clearAuth() → redirect /login
```

Users never see a token-expiry error during normal use.

---

## End-to-End Data Flow

### Async batch analysis (typical case)

```
1. User fills AnalyzePage form
   testCaseName="should play HD content", sinceDays=7, platform=PERSEUS_ANDROID

2. Axios POST /api/v1/rca/analyze
   Vite proxy → http://localhost:8000/api/v1/rca/analyze
   Browser sends access_token cookie automatically

3. RCA router
   Validates JWT from cookie (AccessTokenBearer dependency)
   Creates JobStatus{PENDING} in job_store → jobId
   Registers background task
   Returns {jobId} HTTP 202

4. Background job
   RUNNING
   es_client.fetch_by_test_case("should play HD content", 7)
     └─ ES query: match_phrase(fullTitle) + time range + err exists
     └─ Returns []FailureRecord

   asyncio.gather over failures:
     rule_engine.evaluate(f)         → {category, confidence, matchedRule}
     known_issue_matcher.find(f)     → "INSP-1234" | None
     verdict_aggregator.aggregate()  → RcaVerdict

   elastic_sink.publish(verdicts)
     └─ mq_publisher.publish_verdicts() → RabbitMQ → Logstash → Elasticsearch

   job_store.set_status(DONE, verdicts, summary{byCategory, byPlatform})

5. Frontend (VerdictsPage)
   Navigated to /jobs/{jobId}
   useJobPolling fires every 3 s
   GET /api/v1/rca/verdicts/{jobId}  (cookie sent automatically)
   Status DONE → render charts + verdict list → stop polling
   Update localStorage history entry
```

---

## Prerequisites

### Backend

| Requirement | Version |
|---|---|
| Python | 3.11 or later |
| Redis | 6.0 or later *(optional — in-memory fallback used if absent)* |
| RabbitMQ | 3.x (internal lab broker) |
| Network | Corporate VPN or internal lab network |

### Frontend

| Requirement | Version |
|---|---|
| Node.js | 18 or later |
| npm | 9 or later |
| Network | Infosys network / VPN (for Artifactory npm registry) |

---

## Environment Setup

### Backend

#### Step 1 — Enter the service directory

```bash
cd rca_service
```

#### Step 2 — Create and activate a virtual environment

```bash
python3 -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows (PowerShell)
venv\Scripts\Activate.ps1
```

#### Step 3 — Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### Step 4 — Configure environment variables

```bash
cp .env .env.local
# Edit .env with your environment values (see Configuration section)
```

#### Step 5 — Start Redis *(optional but recommended)*

```bash
# macOS (Homebrew)
brew install redis        # first time only
brew services start redis

# Linux (systemd)
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:7
```

> If Redis is unavailable the service starts fine and uses an in-memory blocklist instead. Token revocation works but is lost on process restart.

> The SQLite database (`rca_auth.db`) is created automatically on first startup.

### Frontend

#### Step 1 — Authenticate with the Infosys npm registry *(one-time per machine)*

```bash
npm login --registry https://infyartifactory.jfrog.io/artifactory/api/npm/npm/
# Follow the browser prompt to complete authentication
```

> Credentials are stored in `~/.npmrc`. The project `.npmrc` points to this registry automatically.

#### Step 2 — Install dependencies

```bash
cd frontend
npm install
```

---

## Configuration

Copy `.env` in `rca_service/` and fill in values. Run `GET /api/v1/admin/config` (admin role required) to see every field's current value and whether it is still at its compile-time default.

```env
# ── ODH (Elasticsearch) ───────────────────────────────────────
ODH_URL=http://es-tier-1.access.internal:9200
ODH_FAILURE_INDEX=inspector-monitor-*

# ── Jira ──────────────────────────────────────────────────────
JIRA_URL=https://jira.example.com          # used for /browse/{ticket} links in verdicts
JIRA_INJECTOR_URL=http://<host>/jira/
JIRA_INJECTOR_JQL=searchJql
JIRA_INJECTOR_GET_ISSUE_BY_ID=getIssueById

# ── RabbitMQ ──────────────────────────────────────────────────
RABBITMQ_URL=amqp://user:password@<broker-host>/vhost
USE_RMQ_FETCHER=true          # proxy ODH calls via RMQ when running without lab VPN
EXCHANGE_INSPECTOR=inspectormanager
PUB_LOGSTASH=logstash
PUB_RMQ2HTTP=sendHttpRequests

# ── InspectorWeb ──────────────────────────────────────────────
INSPECTORWEB_BASE_URL=https://<inspectorweb-host>
INSPECTORWEB_USERNAME=rca-agent            # sent as Inspector-User header
LOCAL_TIMEZONE=Europe/Brussels             # IANA timezone for execution queries

# ── Auth ──────────────────────────────────────────────────────
DATABASE_URL=sqlite+aiosqlite:///./rca_auth.db
JWT_SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=7

# Cookie settings — set COOKIE_SECURE=true in production (HTTPS)
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# ── Redis ─────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Optional features ─────────────────────────────────────────
RCA_JIRA_COMMENT_ENABLED=false   # post comment on Jira ticket when KNOWN_ISSUE found
```

---

## Running the System

### One command — start everything

From the project root:

```bash
./run.sh
```

This starts Redis (if installed), the FastAPI backend on `:8000`, and the Vite dev server on `:3000`. Press **Ctrl+C** to stop all three.

### Individually

```bash
# Backend (from rca_service/)
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (from frontend/)
npm run dev

# Production build
npm run build      # outputs to frontend/dist/
npm run preview    # serve production build locally
```

### Service URLs

| URL | Description |
|---|---|
| `http://localhost:3000` | React dashboard |
| `http://localhost:8000/api/v1/docs` | Interactive Swagger UI (custom, role-aware) |
| `http://localhost:8000/api/v1/redocs` | ReDoc documentation |
| `http://localhost:8000/api/v1/health` | Health check *(requires auth cookie)* |
| `http://localhost:8000/api/v1/regression/meta` | InspectorWeb meta — version, branches *(requires auth)* |

---

## Running Tests

```bash
cd rca_service
source venv/bin/activate

pytest

# With coverage
pytest --cov=app tests/
```

---

## Authentication Flow

Only `@infosys.com` email addresses are permitted. All tokens are stored as **HttpOnly cookies** — curl must use a cookie jar to persist them between requests.

```
POST  /auth/signup    →  Register + receive QR code URL
GET   /auth/totp/qr   →  Scan PNG QR in Google Authenticator or Authy
POST  /auth/activate  →  Verify first 6-digit TOTP code → activate account
POST  /auth/login     →  Email + TOTP code → sets HttpOnly cookies:
                           access_token  (120 min)
                           refresh_token (7 days)
GET   /auth/me        →  Returns current user (email, full_name, role, created_at) — reads from DB
PATCH /auth/me        →  Update full_name (max 15 chars, strip_whitespace)
POST  /auth/refresh   →  Rotate cookie pair (old refresh token immediately revoked)
POST  /auth/logout    →  Revoke all sessions + clear cookies
```

### Step 1 — Register

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/signup \
  -F "email=you@infosys.com" \
  -F "full_name=Your Name"
```

### Step 2 — Scan QR code

Open in a browser and scan with **Google Authenticator** or **Authy**:

```
http://localhost:8000/api/v1/auth/totp/qr?email=you@infosys.com
```

### Step 3 — Activate account

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/activate \
  -F "email=you@infosys.com" \
  -F "otp=482910"
```

### Step 4 — Login

Tokens are set as HttpOnly cookies — use `-c` to save and `-b` to send them:

```bash
curl -s -c cookies.txt -X POST http://localhost:8000/api/v1/auth/login \
  -F "email=you@infosys.com" \
  -F "otp=482910"
```

### Step 5 — Call protected endpoints

```bash
# The cookie jar is sent automatically on every subsequent request
curl -s -b cookies.txt http://localhost:8000/api/v1/auth/me
curl -s -b cookies.txt http://localhost:8000/api/v1/health
```

### Step 6 — Refresh

```bash
curl -s -c cookies.txt -b cookies.txt \
  -X POST http://localhost:8000/api/v1/auth/refresh
```

### Step 7 — Logout

```bash
curl -s -b cookies.txt -X POST http://localhost:8000/api/v1/auth/logout
```

---

## API Quick Reference

### Health check

```bash
curl -s -b cookies.txt http://localhost:8000/api/v1/health | jq .
```

### RCA — Analyse by run UUID (synchronous)

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:8000/api/v1/rca/analyze \
  -H "Content-Type: application/json" \
  -d '{"runUuid": "550e8400-e29b-41d4-a716-446655440000"}' | jq .
```

### RCA — Analyse a time window (asynchronous)

```bash
# Submit
JOB_ID=$(curl -s -b cookies.txt \
  -X POST http://localhost:8000/api/v1/rca/analyze \
  -H "Content-Type: application/json" \
  -d '{"sinceMinutes": 60, "platform": "PERSEUS_ANDROID"}' | jq -r '.jobId')

# Poll until DONE
curl -s -b cookies.txt \
  http://localhost:8000/api/v1/rca/verdicts/$JOB_ID | jq .
```

### RCA — Get verdicts by run UUID

```bash
curl -s -b cookies.txt \
  http://localhost:8000/api/v1/rca/verdicts/by-run/<run_uuid> | jq .
```

### Admin — Config status

```bash
# Requires admin role
curl -s -b cookies.txt \
  http://localhost:8000/api/v1/admin/config | jq .
```

### Admin — Create user

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:8000/api/v1/admin/users \
  -H "Content-Type: application/json" \
  -d '{"email": "new.user@infosys.com", "role": "user"}' | jq .
```

### Admin — List users

```bash
curl -s -b cookies.txt \
  http://localhost:8000/api/v1/admin/users | jq .
```

### Update profile name

```bash
curl -s -b cookies.txt \
  -X PATCH http://localhost:8000/api/v1/auth/me \
  -H "Content-Type: application/json" \
  -d '{"full_name": "Alice"}' | jq .
```

### Submit feedback

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:8000/api/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "comment": "Great tool!"}' | jq .
```

### Get my notifications

```bash
curl -s -b cookies.txt \
  http://localhost:8000/api/v1/notifications/mine | jq .
```

### Admin — Send announcement

```bash
# Requires admin role
curl -s -b cookies.txt \
  -X POST http://localhost:8000/api/v1/notifications/announce \
  -H "Content-Type: application/json" \
  -d '{"title": "Maintenance window", "message": "Scheduled downtime Saturday 10–11 AM."}' | jq .
```

### Share a report (get public URL)

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:8000/api/v1/rca/reports/share/<job_uid> | jq .
# Returns: { "report_id": "...", "url": "http://localhost:8000/api/v1/rca/reports/view/<id>" }
```

### Regression — List run configs

```bash
curl -s -b cookies.txt \
  http://localhost:8000/api/v1/regression/run-configs | jq .
```

### Regression — Trigger a run

```bash
curl -s -b cookies.txt \
  -X POST http://localhost:8000/api/v1/regression/runs \
  -H "Content-Type: application/json" \
  -d '{"runConfigUuid": "<your-run-config-uuid>"}' | jq .
```

### Regression — Live run status

```bash
curl -s -b cookies.txt \
  http://localhost:8000/api/v1/regression/runs/<run_uuid> | jq .
```

---

## Environment Variables

### Infrastructure

| Variable | Default | Description |
|---|---|---|
| `ODH_URL` | `http://localhost:9200` | Elasticsearch / ODH base URL |
| `ODH_FAILURE_INDEX` | `inspector-monitor-*` | Index pattern for failure records |
| `JIRA_URL` | *(empty)* | Public Jira URL — used to build `/browse/{ticket}` links in verdicts |
| `JIRA_INJECTOR_URL` | `http://localhost:8080` | Jira Injector proxy base URL |
| `JIRA_INJECTOR_JQL` | `/jira/search` | JQL search path suffix |
| `JIRA_INJECTOR_GET_ISSUE_BY_ID` | `/jira/issue` | Issue fetch path suffix |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost/` | RabbitMQ AMQP connection URL |
| `PUB_LOGSTASH` | `logstash` | Exchange/queue for verdict publishing |
| `PUB_RMQ2HTTP` | `sendHttpRequests` | Routing key for RMQ HTTP proxy requests |
| `USE_RMQ_FETCHER` | `false` | Route ODH calls via RabbitMQ proxy |
| `EXCHANGE_INSPECTOR` | `inspectormanager` | Inspector RabbitMQ exchange name |
| `INSPECTORWEB_BASE_URL` | `http://localhost:3000` | InspectorWeb base URL |
| `INSPECTORWEB_USERNAME` | `rca-agent` | Sent as `Inspector-User` header |
| `LOCAL_TIMEZONE` | `UTC` | IANA timezone for InspectorWeb execution queries |
| `RCA_JIRA_COMMENT_ENABLED` | `false` | Post Jira comment on KNOWN_ISSUE verdicts |

### Auth & Security

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./rca_auth.db` | Auth DB — swap for `postgresql+asyncpg://...` in production |
| `JWT_SECRET_KEY` | `changeme-…` | JWT signing secret — **must be changed in production** |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `120` | Access token lifetime (2 hours) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis URL for JWT blocklist |
| `COOKIE_SECURE` | `false` | Set `true` in production (HTTPS only) |
| `COOKIE_SAMESITE` | `lax` | SameSite policy (`lax` or `strict`) |

> Run `GET /api/v1/admin/config` to see which variables are still at their compile-time defaults and may need to be set in `.env`.

---

## Network Requirements

All backend dependencies are on the internal lab network and are not reachable from the public internet.

| Service | Requirement |
|---|---|
| ODH (Elasticsearch) | Corporate VPN or internal lab network |
| Jira Injector | Same |
| RabbitMQ | Same |
| InspectorWeb | Same |

> **Tip:** Set `USE_RMQ_FETCHER=true` when running locally without VPN — ODH calls are proxied through RabbitMQ so only the broker needs to be reachable directly.

> **Health check:** `GET /api/v1/health` reports each dependency individually (ODH, Jira, RabbitMQ, InspectorWeb). Failures are non-fatal — analysis still completes but known-issue matching and verdict publishing may be skipped.

---

*© 2026 Infosys Limited — Inspector QA Platform — Maintained by [Kishore Kumar M](mailto:kishor.m@infosys.com)*
