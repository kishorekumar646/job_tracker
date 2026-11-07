"""Application routes."""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ...database import get_async_db
from ...models import Application, Job
from ...schemas import ApplicationCreate, ApplicationResponse

router = APIRouter(prefix="/applications", tags=["applications"])


@router.post("/", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_new_application(
    application_data: ApplicationCreate,
    db: AsyncSession = Depends(get_async_db)
):
    """Create a new job application."""
    user_id = 1  # Placeholder - would be extracted from auth in real implementation
    job = await db.get(Job, application_data.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    db_app = Application(job_id=application_data.job_id, user_id=user_id, notes=application_data.notes)
    db.add(db_app)
    await db.commit()
    await db.refresh(db_app)

    return ApplicationResponse(
        id=db_app.id,
        job_id=db_app.job_id,
        user_id=db_app.user_id,
        notes=db_app.notes,
        status=str(db_app.status),
        created_at=db_app.applied_at,
        updated_at=db_app.updated_at
    )


@router.get("/", response_model=List[ApplicationResponse])
async def list_my_applications(
    db: AsyncSession = Depends(get_async_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    """Get all applications for current user with pagination."""
    user_id = 1  # Placeholder - would be extracted from auth in real implementation
    skip = (page - 1) * page_size
    query = select(Application).where(Application.user_id == user_id).order_by(Application.applied_at.desc())
    result = await db.execute(query.offset(skip).limit(page_size))
    applications = result.scalars().all()
    return [
        ApplicationResponse(
            id=a.id,
            job_id=a.job_id,
            user_id=a.user_id,
            notes=a.notes,
            status=str(a.status),
            created_at=a.applied_at,
            updated_at=a.updated_at
        )
        for a in applications
    ]


@router.get("/{application_id}", response_model=ApplicationResponse)
async def get_application(application_id: int, db: AsyncSession = Depends(get_async_db)):
    """Get a single application."""
    query = select(Application).where(Application.id == application_id)
    result = await db.execute(query)
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    return ApplicationResponse(
        id=application.id,
        job_id=application.job_id,
        user_id=application.user_id,
        notes=application.notes,
        status=str(application.status),
        created_at=application.applied_at,
        updated_at=application.updated_at
    )


@router.patch("/{application_id}", response_model=ApplicationResponse)
async def update_application(
    application_id: int,
    application_data: ApplicationCreate,
    db: AsyncSession = Depends(get_async_db)
):
    """Update an existing application."""
    query = select(Application).where(Application.id == application_id)
    result = await db.execute(query)
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    application.notes = application_data.notes
    await db.commit()
    await db.refresh(application)

    return ApplicationResponse(
        id=application.id,
        job_id=application.job_id,
        user_id=application.user_id,
        notes=application.notes,
        status=str(application.status),
        created_at=application.applied_at,
        updated_at=application.updated_at
    )


@router.delete("/{application_id}")
async def delete_application(application_id: int, db: AsyncSession = Depends(get_async_db)):
    """Delete an application."""
    query = select(Application).where(Application.id == application_id)
    result = await db.execute(query)
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    await db.delete(application)
    await db.commit()
    return {"message": "Application deleted successfully"}