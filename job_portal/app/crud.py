"""CRUD operations for database models."""

from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from .models import User, Job, Application
from .schemas import UserCreate, JobCreate, ApplicationCreate
from .auth import auth_manager
from datetime import datetime


async def create_user(db: AsyncSession, user_data: UserCreate) -> User:
    hashed_password = None
    if user_data.password:
        hashed_password = auth_manager.hash_password(user_data.password)
    db_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        name=user_data.name,
        date_of_birth=user_data.date_of_birth,
        roll_number=user_data.roll_number,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def update_user_totp(db: AsyncSession, user_id: int, totp_secret: str, qr_code: str) -> User:
    db_user = await get_user_by_id(db, user_id)
    if not db_user:
        return None
    db_user.totp_secret = totp_secret
    db_user.qr_code = qr_code
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def activate_user(db: AsyncSession, user_id: int) -> User:
    db_user = await get_user_by_id(db, user_id)
    if not db_user:
        return None
    db_user.is_approved = True
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_job(db: AsyncSession, job_data: JobCreate, owner_id: Optional[int] = None) -> Job:
    db_job = Job(
        title=job_data.title,
        company=job_data.company,
        location=job_data.location,
        description=job_data.description,
        job_url=job_data.external_link or "https://example.com",
        posted_date=job_data.application_date or datetime.utcnow(),
        owner_id=owner_id,
    )
    db.add(db_job)
    await db.commit()
    await db.refresh(db_job)
    return db_job


async def get_job_by_id(db: AsyncSession, job_id: int) -> Optional[Job]:
    result = await db.execute(select(Job).where(Job.id == job_id))
    return result.scalar_one_or_none()


async def get_all_jobs(
    db: AsyncSession, skip: int = 0, limit: int = 50, active_only: bool = True
) -> List[Job]:
    query = select(Job)
    if active_only:
        query = query.where(Job.is_active == True)
    result = await db.execute(query.order_by(Job.scraped_at.desc()).offset(skip).limit(limit))
    return result.scalars().all()


async def create_application(
    db: AsyncSession, application_data: ApplicationCreate, user_id: int
) -> Application:
    db_app = Application(job_id=application_data.job_id, user_id=user_id, notes=application_data.notes)
    db.add(db_app)
    await db.commit()
    await db.refresh(db_app)
    return db_app


async def get_user_applications(
    db: AsyncSession, user_id: int, skip: int = 0, limit: int = 50
) -> List[Application]:
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
    result = await db.execute(
        select(Application)
        .where(Application.id == app_id)
        .options(selectinload(Application.job), selectinload(Application.user))
    )
    return result.scalar_one_or_none()