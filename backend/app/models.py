"""SQLAlchemy models with async support.

Tech stack:
- SQLAlchemy 2.0 models with proper typing
- Async-compatible model definitions
"""

import enum
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Float,
    Text,
    Enum as SAEnum,
    func,
)
from sqlalchemy.orm import (
    relationship,
    Mapped,
    mapped_column,
)
from .database import Base


class UserRole(enum.Enum):
    USER = "user"
    ADMIN = "admin"


class ApplicationStatus(enum.Enum):
    APPLIED = "applied"
    SHORTLISTED = "shortlisted"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_COMPLETED = "interview_completed"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class JobSource(enum.Enum):
    LINKEDIN = "linkedin"
    NAUKRI = "naukri"
    INDEED = "indeed"
    MANUAL = "manual"
    OTHER = "other"


class User(Base):
    """User model with auth support."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="user")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_secret: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notification_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    jobs: Mapped[list["Job"]] = relationship("Job", back_populates="owner")
    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="user"
    )


class Job(Base):
    """Job listing model."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String, index=True)
    company: Mapped[str] = mapped_column(String, index=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(SAEnum(JobSource), default=JobSource.LINKEDIN)
    salary_min_lpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    salary_max_lpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    job_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    experience_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    experience_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    job_url: Mapped[str] = mapped_column(String)
    posted_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )

    owner: Mapped[Optional[User]] = relationship("User", back_populates="jobs")
    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="job"
    )


class Application(Base):
    """Job application tracking model."""

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(SAEnum(ApplicationStatus), default=ApplicationStatus.APPLIED)
    cover_letter: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    interview_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    offer_salary_lpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Foreign keys
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))

    # Relationships
    job: Mapped[Job] = relationship("Job", back_populates="applications")
    user: Mapped[User] = relationship("User", back_populates="applications")


class Notification(Base):
    """Admin-to-user notification model (throttled)."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    message: Mapped[str] = mapped_column(String)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    user: Mapped[User] = relationship("User")