"""Job Tracker backend application package.

This module contains the FastAPI application and can be run directly.
"""

import logging
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
import time

from app.api.v1 import auth_router, jobs_router, applications_router
from app.database import async_engine, Base, get_async_db
from app.models import User, Job, Application
from app.schemas import UserCreate, UserResponse
from app.crud import create_user, get_user_by_email

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all API requests with response status codes."""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time

        logger.info(
            f"Request: {request.method} {request.url.path} "
            f"- Status: {response.status_code} - "
            f"Time: {process_time:.3f}s"
        )

        # Add custom headers for debugging
        response.headers["X-Process-Time"] = str(process_time)
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle - create tables on startup."""
    logger.info("Starting up Job Tracker API...")
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    logger.info("Shutting down Job Tracker API...")


app = FastAPI(
    title="Job Tracker API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# Add logging middleware
app.add_middleware(LoggingMiddleware)

# CORS for Vite dev server proxy and dynamic ports
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://job-tracker.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["set-cookie", "authorization", "x-process-time"],
)

# Include routers with /api prefix
app.include_router(auth_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Job Tracker API", "version": "1.0.0", "docs": "/docs"}