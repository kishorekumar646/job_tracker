"""Main entry point for the FastAPI app."""
import sys
from pathlib import Path

# Add the job_production directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from starlette.applications import Starlette
from .database import async_engine, Base
from .api.v1.auth import router as auth_router
from .api.v1.jobs import router as jobs_router
from .api.v1.applications import router as applications_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import APIRouter

app = FastAPI(
    title="Job Tracker API",
    version="1.0.0",
    docs_url="/docs",
)

# Health check endpoint for network connectivity verification
@app.api_route("/api/v1/ping", methods=["GET", "HEAD"])
async def ping():
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["set-cookie", "authorization"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1")

@app.on_event("startup")
async def startup():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)