"""
Author: Kishore Kumar
Job routes, mounted at ``/api/v1/jobs``.

    GET    /jobs            browse the catalogue + your own jobs, ranked by match
    POST   /jobs            add a job you found elsewhere
    GET    /jobs/{id}       job detail with your match breakdown
    DELETE /jobs/{id}       delete a job you added
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db
from ...deps import get_current_user
from ...models import Application, Job, JobPreference, User, UserProfile
from ...schemas import JobCreate, JobOut
from ...services.job_feed import sync_for_preferences
from ...services.presenters import job_out

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _visible(user: User):
    return or_(Job.owner_id.is_(None), Job.owner_id == user.id)


async def _context(db: AsyncSession, user: User):
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user.id))
    applied = set((await db.scalars(select(Application.job_id).where(Application.user_id == user.id))).all())
    return profile, prefs, applied


@router.get("", response_model=list[JobOut])
async def list_jobs(
    search: Optional[str] = Query(None, max_length=100),
    location: Optional[str] = Query(None, max_length=100),
    source: Optional[str] = Query(None, max_length=30),
    job_type: Optional[str] = Query(None, max_length=30),
    min_match: int = Query(0, ge=0, le=100),
    hide_applied: bool = False,
    sort: Literal["match", "recent"] = "match",
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    query = select(Job).where(Job.is_active.is_(True), _visible(user))
    if search:
        like = f"%{_escape_like(search.strip())}%"
        query = query.where(or_(
            Job.title.ilike(like, escape="\\"), Job.company.ilike(like, escape="\\"),
            Job.description.ilike(like, escape="\\"),
        ))
    if location:
        like = f"%{_escape_like(location.strip())}%"
        query = query.where(Job.location.ilike(like, escape="\\"))
    if source:
        query = query.where(Job.source == source.lower())
    if job_type:
        query = query.where(Job.job_type == job_type)

    jobs = (await db.scalars(query.order_by(Job.posted_date.desc()).limit(1000))).all()
    profile, prefs, applied = await _context(db, user)

    items = [
        job_out(j, profile, prefs, user.id, applied=j.id in applied) for j in jobs
        if not (hide_applied and j.id in applied)
    ]
    items = [i for i in items if (i.match_score or 0) >= min_match]
    if sort == "match":
        items.sort(key=lambda i: i.match_score or 0, reverse=True)
    return items[skip: skip + limit]


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
async def create_job(body: JobCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    if body.salary_min_lpa and body.salary_max_lpa and body.salary_min_lpa > body.salary_max_lpa:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Minimum salary can't exceed maximum")
    job = Job(
        title=body.title.strip(), company=body.company.strip(), location=body.location,
        description=body.description, job_url=body.external_link or "", source=body.source,
        job_type=body.job_type, skills=body.skills, is_remote=body.is_remote,
        salary_min_lpa=body.salary_min_lpa, salary_max_lpa=body.salary_max_lpa, owner_id=user.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    profile, prefs, applied = await _context(db, user)
    return job_out(job, profile, prefs, user.id, applied=job.id in applied)


async def _get_visible(db: AsyncSession, user: User, job_id: int) -> Job:
    job = await db.scalar(select(Job).where(Job.id == job_id, _visible(user)))
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


@router.post("/refresh")
async def refresh_feed(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    """Pull live postings for the user's preferred titles and locations."""
    _, prefs, _ = await _context(db, user)
    if not prefs or not prefs.job_titles:
        raise HTTPException(status_code=400, detail="Add at least one preferred job title in Settings → Preferences first.")
    return {"added": await sync_for_preferences(db, prefs)}


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    job = await _get_visible(db, user, job_id)
    profile, prefs, applied = await _context(db, user)
    return job_out(job, profile, prefs, user.id, applied=job.id in applied)


@router.delete("/{job_id}")
async def delete_job(job_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    job = await _get_visible(db, user, job_id)
    if job.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete jobs you added")
    await db.delete(job)
    await db.commit()
    return {"message": "Job deleted"}
