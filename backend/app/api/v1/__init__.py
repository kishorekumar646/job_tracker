"""API v1 routes."""

from .auth import router as auth_router
from .jobs import router as jobs_router
from .applications import router as applications_router

__all__ = ["auth_router", "jobs_router", "applications_router"]