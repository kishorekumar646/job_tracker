# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Inspector RCA System: root-cause analysis for Inspector QA automation test failures. Two apps:

- `rca_service/` — FastAPI backend (Python 3.11, async SQLAlchemy, SQLite by default). Pulls failure records from InspectorWeb / Elasticsearch (ODH), classifies them with a pluggable rule engine, cross-references Jira for known issues, and publishes verdicts to RabbitMQ.
- `frontend/` — React 18 + TypeScript + Vite + Tailwind + Zustand dashboard.

`rca_service/README.md` is the detailed reference (architecture diagrams, API curl examples, env vars). It is partly stale; trust the code when they disagree (e.g. it omits `stb.dvr_no_data`).

## Commands

```bash
./run.sh                      # from repo root: starts Redis (if installed), backend :8000 (--reload), Vite :3000
```

Backend (run from `rca_service/`, venv at `rca_service/venv`):
```bash
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
./run.sh                      # same, with LOG_LEVEL=DEBUG
pytest                        # asyncio_mode=auto, testpaths=tests
pytest tests/rules/test_stb_rules.py::test_name   # single test
python tools/make_admin.py <email>                # promote an activated user to admin
```

Frontend (run from `frontend/`):
```bash
npm run dev                   # Vite on :3000, proxies /api → localhost:8000
npm run build                 # tsc && vite build — this is the only type check; there is no lint or test script
```
npm installs require a one-time `npm login` to the Infosys JFrog registry referenced in `frontend/.npmrc`.

`docker-compose up` runs backend + nginx-served frontend (:80) + Redis.

## Backend architecture

- **App factory is `app/__init__.py`** (`app/main.py` just re-exports). It configures logging (`_DailyFileHandler` writes `logs/DD-MM-YYYY.log`, rotating on date change), the lifespan, and mounts all routers under `/api/v1/...`. Swagger lives at `/api/v1/docs` (custom UI in `app/core/docs.py`).
- **No migration tool.** Tables are created via `Base.metadata.create_all` at startup; new columns on existing tables must be added to the idempotent `ALTER TABLE ...` list in `app/__init__.py` so older SQLite DBs upgrade.
- **Config**: all env vars are declared in `app/core/config.py` (Pydantic BaseSettings); see `.env.example`. `USE_RMQ_FETCHER=true` proxies ODH queries over RabbitMQ when off the lab network/VPN.
- **RCA pipeline** (`app/routers/rca.py`): `POST /rca/analyze` with `runUuid` runs synchronously (InspectorWeb is the primary source for runs); a time-window / test-case request creates a DB-backed job (`services/job_store.py`, PENDING→RUNNING→DONE/FAILED) and runs in the background. Per failure: `rule_engine.evaluate()` → `known_issue_matcher` (Jira direct link, then fingerprint JQL) → `verdict_aggregator`. Priority: KNOWN_ISSUE (1.0) > rule match > UNKNOWN. Live server logs reach the browser through `services/log_stream.py` (per-session queue) drained by the SSE endpoint `GET /rca/stream/{session_id}`.
- **Rule engine** (`app/services/rule_engine.py`): each rule is a module under `app/rules/<platform>/` exposing `matches(failure) -> bool` and `explain(failure) -> {category, confidence, explanation, matchedRule}`. Platform pack runs first, then the common pack; **first match wins, order is the list order in `_PLATFORM_PACKS` / `_COMMON_PACK`**. A new rule must be registered there or it never runs. Rule tests live in `tests/rules/`. Per-rule confidence can be adjusted by feedback and admin overrides (`services/rule_confidence.py`).
- **InspectorWeb aborts**: the run-level error is often just `"true"`; the real reason is in the per-target records (`get_abort_reason_from_targets()` in `services/inspectorweb_client.py`).
- **Auth** (`app/auth/`): `@infosys.com` emails only, TOTP-based login, JWT access/refresh tokens in **HttpOnly cookies**, refresh rotation with revoked JTIs in a Redis blocklist (in-memory fallback if Redis is absent). Role checks via `RoleChecker` in `auth/dependencies.py`. Redis also tracks presence (`last_seen:<email>`).
- `tests/conftest.py` auto-patches `mq_publisher` connect/close/publish, so tests never touch RabbitMQ.

## Frontend architecture

- Routes in `src/App.tsx`, wrapped by `ProtectedRoute` + `DashboardLayout`; pages in `src/pages/`.
- `src/api/client.ts` is the shared Axios instance: on 401 it queues requests, calls `POST /auth/refresh`, and replays. **Network errors must not log the user out** — the interceptor, `useTokenExpiry`, `ProtectedRoute`, and auth init all check for network errors before `clearAuth()`; `store/onlineStore.ts` holds the global online flag used by `OfflineBanner`.
- State: Zustand stores in `src/store/` (`authStore` hydrated from `GET /auth/me`; `analyzeStore` persists AnalyzePage progress/step durations). Server data is fetched with plain Axios (React Query is installed but unused).
- User preferences are in localStorage keyed per user (`rca_settings_<email>`, via `utils/settings.ts`); tour/feedback prompt gating also uses per-user localStorage keys.
- All modals use `useModalEscape`; keyboard shortcuts are OS-aware (⌘ vs Ctrl) in `useKeyboardShortcuts`.
- `src/dev/seedDashboard.ts` generates fake dashboard data for local development.

## Conventions

- Source files start with an `Author: Kishore Kumar` header comment (`// Author: ...` in TS, in the module docstring in Python); keep it on new files.
