"""Database configuration with async SQLAlchemy.

Tech stack:
- SQLAlchemy 2.0 async
- pydantic-settings for configuration
- SQLite for development, PostgreSQL for production
"""

import os
import secrets
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""
    DATABASE_URL: str = "sqlite+aiosqlite:///./job_tracker.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: Optional[str] = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    COOKIE_SECURE: bool = False  # Set to True in production with HTTPS

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def __init__(self, **data):
        super().__init__(**data)
        if not self.SECRET_KEY:
            # Generate a random key for development
            # In production, SECRET_KEY must be set via environment variable
            self.SECRET_KEY = os.environ.get("SECRET_KEY", secrets.token_urlsafe(32))


settings = Settings()

# Async engine for runtime operations
async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

# Sync engine for migrations
sync_engine = create_engine(
    settings.DATABASE_URL.replace("+aiosqlite", ""),
    echo=False,
    pool_pre_ping=True,
)

# Session factories
async_session_factory = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

sync_session_factory = sessionmaker(
    bind=sync_engine,
    class_=Session,
    expire_on_commit=False,
)

# Base class for all models
Base = declarative_base()


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for async database session."""
    async with async_session_factory() as session:
        yield session


def get_sync_db():
    """Get a synchronous database session."""
    db = sync_session_factory()
    try:
        yield db
    finally:
        db.close()