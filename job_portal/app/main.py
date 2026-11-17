"""
Author: Kishore Kumar
FastAPI application factory for the Job Tracker API.
"""

import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, literal, text
from sqlalchemy.engine import Connection

from .api import webhooks
from .api.v1 import admin, applications, auto_apply, auth, billing, connections, feedback, jobs, notifications, profile
from .database import Base, async_engine, async_session_factory, settings
from . import models  # noqa: F401  (register tables)
from .services.auto_apply import sweep_all_users
from .services.mail_poller import poll_forever
from .services.sample_jobs import seed_sample_jobs
from .services.frontend import FrontendFiles

logger = logging.getLogger("job_portal")

# Columns added after the first release, with defaults for existing rows.
_COLUMN_UPGRADES = [
    ("jobs", "skills", None),
    ("jobs", "is_remote", False),
    ("applications", "match_score", None),
    ("applications", "auto_applied", False),
    ("users", "is_active", True),
    ("users", "avatar", None),
    ("users", "guide_views", 0),
    ("users", "email_verified", False),
    ("users", "email_code_hash", None),
    ("users", "email_code_expires", None),
    ("users", "email_code_attempts", 0),
    ("users", "last_seen", None),
    ("users", "receive_announcements", True),
    ("users", "plan", "free"),
    ("users", "plan_expires_at", None),
    ("users", "pro_welcome_pending", False),
    ("notifications", "read_at", None),
    ("user_profiles", "resume_data", None),
]


def upgrade_columns(conn: Connection) -> None:
    inspector = inspect(conn)
    columns = {
        table: {c["name"] for c in inspector.get_columns(table)}
        for table in {item[0] for item in _COLUMN_UPGRADES}
    }
    quote = conn.dialect.identifier_preparer.quote
    for table, name, default in _COLUMN_UPGRADES:
        if name in columns[table]:
            continue
        column_type = Base.metadata.tables[table].c[name].type.compile(dialect=conn.dialect)
        default_sql = "" if default is None else " DEFAULT " + str(
            literal(default).compile(dialect=conn.dialect, compile_kwargs={"literal_binds": True})
        )
        conn.execute(text(f"ALTER TABLE {quote(table)} ADD COLUMN {quote(name)} {column_type}{default_sql}"))
    if conn.dialect.name == "postgresql":
        # Supabase's browser-facing roles must not bypass the backend's authorization.
        for table in Base.metadata.sorted_tables:
            conn.execute(text(f"ALTER TABLE {quote(table.name)} ENABLE ROW LEVEL SECURITY"))


async def init_db() -> None:
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(upgrade_columns)
    async with async_session_factory() as db:
        await seed_sample_jobs(db)


async def _scheduler(interval_minutes: int) -> None:
    while True:
        await asyncio.sleep(interval_minutes * 60)
        try:
            applied = await sweep_all_users()
            logger.info("scheduled auto-apply sweep finished, %s applications", applied)
        except Exception:
            logger.exception("scheduled auto-apply sweep failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    task = None
    if settings.AUTO_APPLY_INTERVAL_MINUTES > 0:
        task = asyncio.create_task(_scheduler(settings.AUTO_APPLY_INTERVAL_MINUTES))
    mail_task = asyncio.create_task(poll_forever()) if settings.IMAP_HOST else None
    yield
    for t in (task, mail_task):
        if t:
            t.cancel()


app = FastAPI(title="Job Tracker API", version="2.0.0", docs_url="/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/api/v1/ping", methods=["GET", "HEAD"])
async def ping():
    return {"status": "ok"}


for _router in (auth.router, admin.router, profile.router, connections.router, notifications.router, jobs.router, applications.router, auto_apply.router, billing.router, feedback.router):
    app.include_router(_router, prefix="/api/v1")
app.include_router(webhooks.router)

if settings.FRONTEND_DIST:
    frontend = Path(settings.FRONTEND_DIST).resolve()
    if not (frontend / "index.html").is_file():
        raise RuntimeError("FRONTEND_DIST must point to a built frontend containing index.html")
    app.mount("/", FrontendFiles(directory=str(frontend), html=True), name="frontend")
