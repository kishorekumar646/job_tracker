"""CRUD operations for database models."""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .models import User, Job, Application, Notification
from .schemas import UserCreate, JobCreate, ApplicationCreate
from .auth import auth_manager


async def create_user(db: AsyncSession, user_data: UserCreate) -> User:
    """Create a new user with hashed password."""
    hashed_password = auth_manager.hash_password(user_data.password)
    db_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        name=user_data.name,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """Get user by email."""
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    """Get user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_all_users(
    db: AsyncSession, skip: int = 0, limit: int = 100
) -> List[User]:
    """Get all users with pagination."""
    result = await db.execute(select(User).offset(skip).limit(limit))
    return result.scalars().all()


async def create_job(db: AsyncSession, job_data: JobCreate, owner_id: Optional[int] = None) -> Job:
    """Create a new job listing."""
    db_job = Job(
        title=job_data.title,
        company=job_data.company,
        location=job_data.location,
        description=job_data.description,
        salary_min_lpa=job_data.salary_min_lpa,
        salary_max_lpa=job_data.salary_max_lpa,
        job_type=job_data.job_type,
        experience_min=job_data.experience_min,
        experience_max=job_data.experience_max,
        external_id=job_data.external_id,
        job_url=job_data.job_url,
        source=job_data.source or "linkedin",
        owner_id=owner_id,
    )
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)
    return db_job


async def get_job_by_id(db: AsyncSession, job_id: int) -> Optional[Job]:
    """Get a job by ID."""
    result = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    return result.scalar_one_or_none()


async def get_job(db: AsyncSession, job_id: int) -> Optional[Job]:
    """Get an active job by ID."""
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.is_active == True)
    )
    return result.scalar_one_or_none()


async def get_all_jobs(
    db: AsyncSession, skip: int = 0, limit: int = 50, active_only: bool = True
) -> List[Job]:
    """Get all jobs with pagination."""
    query = select(Job)
    if active_only:
        query = query.where(Job.is_active == True)
    result = await db.execute(query.order_by(Job.scraped_at.desc()).offset(skip).limit(limit))
    return result.scalars().all()


async def update_job_status(
    db: AsyncSession, job_id: int, is_active: bool
) -> Optional[Job]:
    """Update job active status."""
    result = await db.execute(
        update(Job).where(Job.id == job_id).values(is_active=is_active)
    )
    await db.commit()
    return await get_job(db, job_id)


async def create_application(
    db: AsyncSession, application_data: ApplicationCreate, user_id: int
) -> Application:
    """Create a job application."""
    db_app = Application(
        job_id=application_data.job_id,
        user_id=user_id,
    )
    db.add(db_app)
    await db.commit()
    await db.refresh(db_app)
    return db_app


async def get_user_applications(
    db: AsyncSession, user_id: int, skip: int = 0, limit: int = 50
) -> List[Application]:
    """Get all applications for a user."""
    result = await db.execute(
        select(Application)
        .where(Application.user_id == user_id)
        .order_by(Application.applied_at.desc())
        .offset(skip)
        .limit(limit)
        .options(selectinload(Application.job))
    )
    return result.scalars().all()


async def get_application(db: AsyncSession, app_id: int) -> Optional[Application]:
    """Get an application by ID."""
    result = await db.execute(
        select(Application)
        .where(Application.id == app_id)
        .options(
            selectinload(Application.job),
            selectinload(Application.user),
        )
    )
    return result.scalar_one_or_none()


async def create_notification(
    db: AsyncSession, notification_data: dict
) -> Notification:
    """Create a notification for a user."""
    db_notification = Notification(
        user_id=notification_data["user_id"],
        message=notification_data["message"],
    )
    db.add(db_notification)
    await db.commit()
    await db.refresh(db_notification)

    user = await get_user_by_id(db, notification_data["user_id"])
    if user:
        user.notification_count += 1
        await db.commit()

    return db_notification


async def get_user_notifications(
    db: AsyncSession, user_id: int, skip: int = 0, limit: int = 50
) -> List[Notification]:
    """Get all notifications for a user."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


async def mark_notification_read(db: AsyncSession, notification_id: int) -> bool:
    """Mark a notification as read."""
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notification = result.scalar_one_or_none()
    if notification:
        notification.is_read = True
        await db.commit()
        return True
    return False