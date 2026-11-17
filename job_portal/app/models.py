"""
Author: Kishore Kumar
SQLAlchemy models.
"""

import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Boolean, DateTime, Float, Text, JSON, ForeignKey, UniqueConstraint, LargeBinary
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .database import Base


class ApplicationStatus(str, enum.Enum):
    TO_APPLY = "to_apply"
    APPLIED = "applied"
    SHORTLISTED = "shortlisted"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_COMPLETED = "interview_completed"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class JobSource(str, enum.Enum):
    LINKEDIN = "linkedin"
    NAUKRI = "naukri"
    INDEED = "indeed"
    GLASSDOOR = "glassdoor"
    FOUNDIT = "foundit"
    INSTAHYRE = "instahyre"
    MANUAL = "manual"
    OTHER = "other"


# Platforms a user can link for auto-apply.
PLATFORMS = ["linkedin", "naukri", "indeed", "glassdoor", "foundit", "instahyre"]


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    guide_views: Mapped[int] = mapped_column(Integer, default=0)
    date_of_birth: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    roll_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="user")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_code_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email_code_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    email_code_attempts: Mapped[int] = mapped_column(Integer, default=0)
    totp_secret: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    qr_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receive_announcements: Mapped[bool] = mapped_column(Boolean, default=True)
    plan: Mapped[str] = mapped_column(String, default="free")
    plan_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    pro_welcome_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", back_populates="user", cascade="all, delete-orphan"
    )
    jobs: Mapped[list["Job"]] = relationship("Job", back_populates="owner")
    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="user", cascade="all, delete-orphan"
    )
    profile: Mapped[Optional["UserProfile"]] = relationship(
        "UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    preferences: Mapped[Optional["JobPreference"]] = relationship(
        "JobPreference", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    social_accounts: Mapped[list["SocialAccount"]] = relationship(
        "SocialAccount", back_populates="user", cascade="all, delete-orphan"
    )
    passkeys: Mapped[list["Passkey"]] = relationship(cascade="all, delete-orphan")
    passkey_challenges: Mapped[list["PasskeyChallenge"]] = relationship(cascade="all, delete-orphan")
    feedback: Mapped[list["Feedback"]] = relationship(cascade="all, delete-orphan")


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    page: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(16), default="new", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Passkey(Base):
    __tablename__ = "passkeys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    credential_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    public_key: Mapped[bytes] = mapped_column(LargeBinary)
    sign_count: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PasskeyChallenge(Base):
    __tablename__ = "passkey_challenges"
    challenge: Mapped[str] = mapped_column(String, primary_key=True)
    purpose: Mapped[str] = mapped_column(String)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class UserProfile(Base):
    """Resume-derived profile used to match jobs."""
    __tablename__ = "user_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, index=True)
    headline: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    experience_years: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    resume_filename: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    resume_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    resume_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True, deferred=True)
    resume_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resume_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resume_uploaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship("User", back_populates="profile")


class JobPreference(Base):
    """What the user wants: titles, locations and auto-apply behaviour."""
    __tablename__ = "job_preferences"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, index=True)
    job_titles: Mapped[list] = mapped_column(JSON, default=list)
    locations: Mapped[list] = mapped_column(JSON, default=list)
    job_types: Mapped[list] = mapped_column(JSON, default=list)
    remote_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    min_salary_lpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    auto_apply_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    daily_limit: Mapped[int] = mapped_column(Integer, default=10)
    min_match_score: Mapped[int] = mapped_column(Integer, default=60)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship("User", back_populates="preferences")


class SocialAccount(Base):
    """A job platform account the user linked for auto-apply."""
    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("user_id", "platform", name="uq_social_user_platform"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    platform: Mapped[str] = mapped_column(String)
    handle: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    profile_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    connected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship("User", back_populates="social_accounts")


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String, index=True)
    company: Mapped[str] = mapped_column(String, index=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String, default=JobSource.MANUAL.value)
    skills: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False)
    salary_min_lpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    salary_max_lpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    job_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    experience_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    experience_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    external_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    job_url: Mapped[str] = mapped_column(String)
    posted_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    owner: Mapped[Optional[User]] = relationship("User", back_populates="jobs")
    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="job", cascade="all, delete-orphan"
    )


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_application_user_job"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String, default=ApplicationStatus.APPLIED.value)
    cover_letter: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    interview_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    offer_salary_lpa: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    match_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    auto_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    job: Mapped[Job] = relationship("Job", back_populates="applications")
    user: Mapped[User] = relationship("User", back_populates="applications")


class AutoApplyRun(Base):
    """One auto-apply sweep (manual or scheduled) and its outcome."""
    __tablename__ = "auto_apply_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    trigger: Mapped[str] = mapped_column(String, default="manual")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    evaluated: Mapped[int] = mapped_column(Integer, default=0)
    applied: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class Announcement(Base):
    """A broadcast sent by an admin; each recipient gets a Notification row."""
    __tablename__ = "announcements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    sender_email: Mapped[str] = mapped_column(String)
    sender_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    announcement_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("announcements.id"), nullable=True, index=True)
    notif_type: Mapped[str] = mapped_column(String, default="announcement")
    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text, default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="notifications")


class Order(Base):
    """A checkout for a plan. ``unique_amount`` (paise) differs per open order so a credit can be matched to it."""
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_ref: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    plan_id: Mapped[str] = mapped_column(String, default="pro")
    base_amount: Mapped[int] = mapped_column(Integer)
    unique_amount: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String, default="PENDING", index=True)  # PENDING | PAID | EXPIRED | FAILED
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    invoice_no: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), index=True)
    utr_number: Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True)  # one UTR can pay one order
    raw_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    verification_source: Mapped[str] = mapped_column(String)  # WEBHOOK | BANK_STATEMENT | ADMIN


class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)
    plan_id: Mapped[str] = mapped_column(String, default="pro")
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    start_date: Mapped[datetime] = mapped_column(DateTime)
    end_date: Mapped[datetime] = mapped_column(DateTime)


class BankEntry(Base):
    """A credit row from an uploaded bank statement, used to verify UTRs users submit."""
    __tablename__ = "bank_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    utr: Mapped[str] = mapped_column(String, unique=True, index=True)
    amount_paise: Mapped[int] = mapped_column(Integer, index=True)
    narration: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WebhookLog(Base):
    __tablename__ = "webhook_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    raw: Mapped[str] = mapped_column(Text)
    amount_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    utr: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    order_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    result: Mapped[str] = mapped_column(String)  # MATCHED | UNMATCHED | IGNORED | DUPLICATE | REJECTED
    order_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
