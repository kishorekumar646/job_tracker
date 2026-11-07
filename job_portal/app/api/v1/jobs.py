"""Job routes."""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from ...database import get_async_db
from ...models import Job
from ...schemas import JobCreate, JobResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/", response_model=List[JobResponse])
async def list_jobs(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = Query(None, description="Search by title or company"),
    db: AsyncSession = Depends(get_async_db)
):
    """List all jobs with optional search."""
    query = select(Job)
    if search:
        query = query.where(
            (Job.title.contains(search)) | (Job.company.contains(search))
        )
    result = await db.execute(query.offset(skip).limit(limit))
    jobs = result.scalars().all()
    return [
        JobResponse(
            id=j.id,
            title=j.title,
            company=j.company,
            location=j.location,
            description=j.description,
            external_link=j.job_url,
            application_date=j.posted_date,
            created_at=j.scraped_at,
            updated_at=j.scraped_at
        )
        for j in jobs
    ]


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: int, db: AsyncSession = Depends(get_async_db)):
    """Get a single job."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        id=job.id,
        title=job.title,
        company=job.company,
        location=job.location,
        description=job.description,
        external_link=job.job_url,
        application_date=job.posted_date,
        created_at=job.scraped_at,
        updated_at=job.scraped_at
    )


@router.post("/", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_new_job(job_data: JobCreate, db: AsyncSession = Depends(get_async_db)):
    """Create a new job listing."""
    from ...crud import create_job
    job = await create_job(db, job_data)
    return JobResponse(
        id=job.id,
        title=job.title,
        company=job.company,
        location=job.location,
        description=job.description,
        external_link=job.job_url,
        application_date=job.posted_date,
        created_at=job.scraped_at,
        updated_at=job.scraped_at
    )