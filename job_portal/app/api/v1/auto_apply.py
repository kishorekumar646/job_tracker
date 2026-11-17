"""
Author: Kishore Kumar
Auto-apply routes, mounted at ``/api/v1/auto-apply``.

    GET  /auto-apply/status   readiness, schedule, today's usage and last run
    POST /auto-apply/run      run a sweep now
    GET  /auto-apply/runs     run history
    GET  /auto-apply/runs/{id} job details captured by a run
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...database import get_async_db, settings
from ...deps import get_current_user
from ...models import AutoApplyRun, JobPreference, User
from ...schemas import AutoApplyRunDetail, AutoApplyRunOut, AutoApplyStatus
from ...services.plans import lifetime_apply_cap
from ...services.auto_apply import applied_today, auto_applied_total, readiness_blockers, run_auto_apply

router = APIRouter(prefix="/auto-apply", tags=["auto-apply"])


async def _last_run(db: AsyncSession, user_id: int):
    return await db.scalar(
        select(AutoApplyRun).where(AutoApplyRun.user_id == user_id).order_by(AutoApplyRun.id.desc()).limit(1)
    )


@router.get("/status", response_model=AutoApplyStatus)
async def auto_apply_status(request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user.id))
    blockers, platforms = await readiness_blockers(db, user.id)
    last = await _last_run(db, user.id)
    return AutoApplyStatus(
        enabled=bool(prefs and prefs.auto_apply_enabled),
        ready=not blockers, blockers=blockers, connected_platforms=platforms,
        applied_today=await applied_today(db, user.id),
        daily_limit=prefs.daily_limit if prefs else 10,
        lifetime_used=await auto_applied_total(db, user.id),
        lifetime_limit=lifetime_apply_cap(user),
        schedule_interval_minutes=settings.AUTO_APPLY_INTERVAL_MINUTES,
        next_scheduled_at=getattr(request.app.state, "auto_apply_next_check_at", None),
        scheduled_sweep_running=getattr(request.app.state, "auto_apply_sweep_running", False),
        last_run=AutoApplyRunOut.model_validate(last, from_attributes=True) if last else None,
    )


@router.post("/run", response_model=AutoApplyRunOut)
async def trigger_run(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    blockers, _ = await readiness_blockers(db, user.id)
    if blockers:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(blockers))
    run = await run_auto_apply(db, user, trigger="manual")
    return AutoApplyRunOut.model_validate(run, from_attributes=True)


@router.get("/runs", response_model=list[AutoApplyRunOut])
async def list_runs(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    runs = (
        await db.scalars(
            select(AutoApplyRun).where(AutoApplyRun.user_id == user.id).order_by(AutoApplyRun.id.desc()).limit(limit)
        )
    ).all()
    return [AutoApplyRunOut.model_validate(r, from_attributes=True) for r in runs]


@router.get("/runs/{run_id}", response_model=AutoApplyRunDetail)
async def run_details(
    run_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    run = await db.scalar(
        select(AutoApplyRun).where(AutoApplyRun.id == run_id, AutoApplyRun.user_id == user.id)
        .options(selectinload(AutoApplyRun.jobs))
    )
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return AutoApplyRunDetail.model_validate(run)
