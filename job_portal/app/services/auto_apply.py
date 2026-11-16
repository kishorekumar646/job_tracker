"""
Author: Kishore Kumar
Auto-apply engine: matches catalogue jobs against a user's resume and
preferences and records applications on the platforms they have linked.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import async_session_factory
from ..models import Application, AutoApplyRun, Job, JobPreference, SocialAccount, User, UserProfile
from .job_feed import FEED_PREFIXES, sync_for_preferences
from .matching import score_job
from .plans import daily_apply_cap, lifetime_apply_cap

logger = logging.getLogger("job_portal.auto_apply")

CANDIDATE_POOL = 500


async def applied_today(db: AsyncSession, user_id: int) -> int:
    since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return await db.scalar(
        select(func.count(Application.id)).where(
            Application.user_id == user_id,
            Application.auto_applied.is_(True),
            Application.applied_at >= since,
        )
    ) or 0


async def auto_applied_total(db: AsyncSession, user_id: int) -> int:
    return await db.scalar(
        select(func.count(Application.id)).where(Application.user_id == user_id, Application.auto_applied.is_(True))
    ) or 0


async def readiness_blockers(db: AsyncSession, user_id: int) -> tuple[list[str], list[str]]:
    """What stops auto-apply from running; also returns connected platforms."""
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user_id))
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user_id))
    accounts = (await db.scalars(select(SocialAccount).where(SocialAccount.user_id == user_id))).all()
    platforms = [a.platform for a in accounts]

    blockers: list[str] = []
    if not await db.scalar(select(User.email_verified).where(User.id == user_id)):
        blockers.append("Verify your email in Settings → Profile")
    if not profile or not profile.skills:
        blockers.append("Upload your resume or add skills")
    if not prefs or not prefs.job_titles:
        blockers.append("Add at least one preferred job title")
    if not platforms:
        blockers.append("Connect at least one job platform")
    return blockers, platforms


async def run_auto_apply(db: AsyncSession, user: User, trigger: str = "manual") -> AutoApplyRun:
    """Apply to the best-matching new jobs, honouring daily limit and min score."""
    run = AutoApplyRun(user_id=user.id, trigger=trigger)
    db.add(run)

    blockers, platforms = await readiness_blockers(db, user.id)
    if blockers:
        run.message = "Not ready: " + "; ".join(blockers)
        await db.commit()
        await db.refresh(run)
        return run

    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user.id))

    limit = min(prefs.daily_limit, daily_apply_cap(user))
    remaining = max(0, limit - await applied_today(db, user.id))
    lifetime = lifetime_apply_cap(user)
    if lifetime is not None:
        left = max(0, lifetime - await auto_applied_total(db, user.id))
        if left == 0:
            remaining = 0
        else:
            remaining = min(remaining, left)
    if remaining == 0:
        run.message = (
            f"Free plan limit of {lifetime} auto-applies reached - upgrade to Pro to continue"
            if lifetime is not None and await auto_applied_total(db, user.id) >= lifetime
            else f"Daily limit of {limit} reached"
        )
        await db.commit()
        await db.refresh(run)
        return run

    await sync_for_preferences(db, prefs)

    already = set(
        (await db.scalars(select(Application.job_id).where(Application.user_id == user.id))).all()
    )
    jobs = (
        await db.scalars(
            select(Job)
            .where(Job.is_active.is_(True), or_(Job.source.in_(platforms), *[Job.external_id.like(f"{p}%") for p in FEED_PREFIXES]))
            .order_by(Job.posted_date.desc())
            .limit(CANDIDATE_POOL)
        )
    ).all()

    ranked: list[tuple[int, Job]] = []
    for job in jobs:
        if job.id in already:
            continue
        run.evaluated += 1
        result = score_job(job, profile, prefs)
        if not result.eligible or result.score < prefs.min_match_score:
            run.skipped += 1
            continue
        ranked.append((result.score, job))

    ranked.sort(key=lambda r: r[0], reverse=True)
    for score, job in ranked[:remaining]:
        if (job.external_id or "").startswith(FEED_PREFIXES):
            # Real postings can't be submitted on the user's behalf: queue them to finish on the employer's page.
            db.add(Application(
                user_id=user.id, job_id=job.id, match_score=score, auto_applied=True, status="to_apply",
                notes=f"Queued by auto-apply (match {score}%). Open the posting to submit, then mark as Applied.",
            ))
        else:
            db.add(Application(
                user_id=user.id, job_id=job.id, match_score=score, auto_applied=True,
                notes=f"Auto-applied via {job.source.title()} (match {score}%)",
            ))
        run.applied += 1
    run.skipped += max(0, len(ranked) - remaining)

    run.message = (
        f"Matched and queued {run.applied} job{'s' if run.applied != 1 else ''}"
        if run.applied else "No new jobs matched your resume and preferences"
    )
    await db.commit()
    await db.refresh(run)
    logger.info("auto-apply user=%s trigger=%s applied=%s", user.id, trigger, run.applied)
    return run


async def sweep_all_users() -> int:
    """Scheduled pass over every user who has auto-apply switched on."""
    count = 0
    async with async_session_factory() as db:
        users = (
            await db.scalars(
                select(User).join(JobPreference, JobPreference.user_id == User.id)
                .where(JobPreference.auto_apply_enabled.is_(True), User.email_verified.is_(True))
            )
        ).all()
        for user in users:
            try:
                run = await run_auto_apply(db, user, trigger="scheduled")
                count += run.applied
            except Exception:
                logger.exception("scheduled auto-apply failed for user %s", user.id)
                await db.rollback()
    return count
