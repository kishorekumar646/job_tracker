"""
Author: Kishore Kumar
Application tracker routes, mounted at ``/api/v1/applications``.

    GET    /applications            your applications (filter by status/source)
    POST   /applications            apply to / track a job
    GET    /applications/stats      dashboard numbers
    GET    /applications/{id}
    PATCH  /applications/{id}       update status, notes, interview date, offer
    DELETE /applications/{id}
"""

from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...database import get_async_db
from ...deps import get_current_user
from ...models import Application, Job, JobPreference, SocialAccount, User, UserProfile
from ...schemas import ApplicationCreate, ApplicationOut, ApplicationUpdate, DashboardStats
from ...services.matching import score_job
from ...services.presenters import application_out, profile_completeness

router = APIRouter(prefix="/applications", tags=["applications"])

_RESPONDED = {"shortlisted", "interview_scheduled", "interview_completed", "offer", "rejected"}


def _mine(user: User, start: Optional[date] = None, end: Optional[date] = None):
    query = select(Application).where(Application.user_id == user.id).options(selectinload(Application.job))
    if start:
        query = query.where(Application.applied_at >= datetime.combine(start, time.min))
    if end:
        query = query.where(Application.applied_at < datetime.combine(end + timedelta(days=1), time.min))
    return query


async def _own_application(db: AsyncSession, user: User, application_id: int) -> Application:
    app = await db.scalar(_mine(user).where(Application.id == application_id))
    if not app:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    return app


@router.get("", response_model=list[ApplicationOut])
async def list_applications(
    status_filter: Optional[str] = Query(None, alias="status", max_length=30),
    source: Optional[str] = Query(None, max_length=30),
    search: Optional[str] = Query(None, max_length=100),
    start: Optional[date] = None,
    end: Optional[date] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    query = _mine(user, start, end).join(Job, Job.id == Application.job_id)
    if status_filter:
        query = query.where(Application.status == status_filter.lower())
    if source:
        query = query.where(Job.source == source.lower())
    if search:
        like = f"%{search.strip().replace('%', '').replace('_', '')}%"
        query = query.where(or_(Job.title.ilike(like), Job.company.ilike(like)))
    apps = (await db.scalars(query.order_by(Application.applied_at.desc()).offset(skip).limit(limit))).all()
    return [application_out(a) for a in apps]


@router.post("", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
async def create_application(
    body: ApplicationCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    job = await db.scalar(select(Job).where(Job.id == body.job_id, or_(Job.owner_id.is_(None), Job.owner_id == user.id)))
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if await db.scalar(select(Application.id).where(Application.user_id == user.id, Application.job_id == job.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already applied to this job")

    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user.id))
    app = Application(
        user_id=user.id, job_id=job.id, notes=body.notes, status=body.status,
        match_score=score_job(job, profile, prefs).score,
    )
    db.add(app)
    await db.commit()
    return application_out(await _own_application(db, user, app.id))


@router.get("/stats", response_model=DashboardStats)
async def stats(
    start: Optional[date] = None,
    end: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    apps = (await db.scalars(_mine(user, start, end).order_by(Application.applied_at.desc()))).all()
    by_status: dict[str, int] = {}
    by_source: dict[str, int] = {}
    by_day: dict[str, int] = {}
    for a in apps:
        day = a.applied_at.date().isoformat()
        by_day[day] = by_day.get(day, 0) + 1
        s = (a.status or "applied").lower()
        by_status[s] = by_status.get(s, 0) + 1
        src = (a.job.source or "other").lower()
        by_source[src] = by_source.get(src, 0) + 1

    total = len(apps)
    responded = sum(v for k, v in by_status.items() if k in _RESPONDED)
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user.id))
    connected = await db.scalar(select(func.count(SocialAccount.id)).where(SocialAccount.user_id == user.id))
    return DashboardStats(
        total_applications=total,
        auto_applied=sum(1 for a in apps if a.auto_applied),
        by_status=by_status, by_source=by_source, by_day=by_day,
        interviews=by_status.get("interview_scheduled", 0) + by_status.get("interview_completed", 0),
        offers=by_status.get("offer", 0),
        response_rate=round(100 * responded / total) if total else 0,
        connected_platforms=connected or 0,
        profile_completeness=profile_completeness(profile, prefs),
        recent=[application_out(a) for a in apps[:6]],
    )


@router.get("/{application_id}", response_model=ApplicationOut)
async def get_application(
    application_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    return application_out(await _own_application(db, user, application_id))


@router.patch("/{application_id}", response_model=ApplicationOut)
async def update_application(
    application_id: int,
    body: ApplicationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    app = await _own_application(db, user, application_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None and key == "status":
            continue
        setattr(app, key, value)
    await db.commit()
    return application_out(await _own_application(db, user, application_id))


@router.delete("/{application_id}")
async def delete_application(
    application_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    app = await _own_application(db, user, application_id)
    await db.delete(app)
    await db.commit()
    return {"message": "Application deleted"}
