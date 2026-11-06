"""Job routes."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db
from ...models import Job, User
from ...schemas import JobCreate, JobResponse
from ...crud import get_all_jobs, get_job_by_id, create_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/", response_model=List[JobResponse])
async def list_jobs(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_async_db),
):
    """List all active jobs."""
    jobs = await get_all_jobs(db, skip=skip, limit=limit)
    return jobs


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: int, db: AsyncSession = Depends(get_async_db)):
    """Get a single job."""
    job = await get_job_by_id(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_new_job(
    job_data: JobCreate,
    db: AsyncSession = Depends(get_async_db),
):
    """Create a new job listing."""
    job = await create_job(db, job_data)
    return job