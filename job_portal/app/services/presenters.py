"""
Author: Kishore Kumar
Helpers that turn ORM objects into API schemas.
"""

from typing import Optional

from ..models import Application, Job, JobPreference, UserProfile
from ..schemas import ApplicationOut, JobOut, ProfileOut
from .matching import job_skills, score_job


def profile_completeness(profile: Optional[UserProfile], prefs: Optional[JobPreference]) -> int:
    checks = [
        bool(profile and profile.resume_filename),
        bool(profile and profile.skills),
        bool(profile and profile.headline),
        bool(profile and profile.location),
        bool(profile and profile.experience_years is not None),
        bool(prefs and prefs.job_titles),
        bool(prefs and prefs.locations),
    ]
    return round(100 * sum(checks) / len(checks))


def profile_out(profile: Optional[UserProfile], prefs: Optional[JobPreference]) -> ProfileOut:
    if not profile:
        return ProfileOut(completeness=profile_completeness(None, prefs))
    return ProfileOut(
        headline=profile.headline, summary=profile.summary, phone=profile.phone,
        location=profile.location, experience_years=profile.experience_years,
        skills=list(profile.skills or []), resume_filename=profile.resume_filename,
        resume_size=profile.resume_size, resume_uploaded_at=profile.resume_uploaded_at,
        completeness=profile_completeness(profile, prefs),
    )


def job_out(
    job: Job,
    profile: Optional[UserProfile] = None,
    prefs: Optional[JobPreference] = None,
    user_id: Optional[int] = None,
    applied: bool = False,
    with_score: bool = True,
) -> JobOut:
    score = matched = None
    if with_score and (profile or prefs):
        result = score_job(job, profile, prefs)
        score, matched = result.score, result.matched_skills
    return JobOut(
        id=job.id, title=job.title, company=job.company, location=job.location,
        description=job.description, external_link=job.job_url,
        source=(job.source or "other").lower(), job_type=job.job_type,
        skills=job_skills(job), is_remote=bool(job.is_remote),
        salary_min_lpa=job.salary_min_lpa, salary_max_lpa=job.salary_max_lpa,
        posted_date=job.posted_date or job.scraped_at,
        match_score=score, matched_skills=matched or [],
        applied=applied, is_own=user_id is not None and job.owner_id == user_id,
    )


def application_out(app: Application) -> ApplicationOut:
    return ApplicationOut(
        id=app.id, job_id=app.job_id, status=(app.status or "applied").lower(),
        notes=app.notes, interview_date=app.interview_date,
        offer_salary_lpa=app.offer_salary_lpa, match_score=app.match_score,
        auto_applied=bool(app.auto_applied), applied_at=app.applied_at,
        updated_at=app.updated_at, job=job_out(app.job, with_score=False, applied=True),
    )
