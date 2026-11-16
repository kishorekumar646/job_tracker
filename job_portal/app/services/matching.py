"""
Author: Kishore Kumar
Job ↔ candidate matching: resume skills, preferred titles and locations.
"""

import re
from dataclasses import dataclass, field
from typing import Optional

from ..models import Job, JobPreference, UserProfile
from .skills import extract_skills, normalize_skills

W_SKILLS, W_TITLE, W_LOCATION = 0.55, 0.30, 0.15
_STOP = {"and", "or", "the", "a", "of", "for", "in", "at", "to", "with", "sr", "jr", "senior", "junior", "lead"}


@dataclass
class MatchResult:
    score: int
    matched_skills: list[str] = field(default_factory=list)
    eligible: bool = True
    reason: Optional[str] = None


_SYNONYMS = {"developer": "engineer", "programmer": "engineer", "engineering": "engineer", "swe": "engineer"}


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9+#.]+", text.lower())
    return {_SYNONYMS.get(t, t) for t in words if t not in _STOP and len(t) > 1}


def _title_score(job_title: str, wanted: list[str]) -> float:
    if not wanted:
        return 0.5
    jt, best = job_title.lower(), 0.0
    job_tokens = _tokens(job_title)
    for w in wanted:
        wl = w.lower().strip()
        if not wl:
            continue
        if wl in jt or jt in wl:
            return 1.0
        wt = _tokens(wl)
        if wt and wt <= job_tokens and len(job_tokens) - len(wt) <= 1:
            best = max(best, 0.9)
        elif wt:
            best = max(best, len(wt & job_tokens) / len(wt))
    return best


def _location_score(job: Job, wanted: list[str], remote_ok: bool) -> float:
    loc = (job.location or "").lower()
    if job.is_remote and remote_ok:
        return 1.0
    if not wanted:
        return 0.5
    for w in wanted:
        wl = w.lower().strip()
        if wl and (wl in loc or (loc and loc in wl)):
            return 1.0
    return 0.0


def job_skills(job: Job) -> list[str]:
    if job.skills:
        return list(job.skills)
    return extract_skills(f"{job.title}\n{job.description or ''}")


def score_job(job: Job, profile: Optional[UserProfile], prefs: Optional[JobPreference]) -> MatchResult:
    """Score 0-100 and flag hard-filter failures (job type, salary)."""
    user_skills = normalize_skills(profile.skills or []) if profile else set()
    jskills = job_skills(job)
    jset = {s.lower(): s for s in jskills}

    matched = [orig for low, orig in jset.items() if low in user_skills]
    if jset:
        skill_part = len(matched) / len(jset)
    else:
        skill_part = 0.5 if user_skills else 0.0

    wanted_titles = (prefs.job_titles if prefs else []) or []
    wanted_locs = (prefs.locations if prefs else []) or []
    remote_ok = prefs.remote_ok if prefs else True

    title_part = _title_score(job.title, wanted_titles)
    loc_part = _location_score(job, wanted_locs, remote_ok)

    score = round(100 * (W_SKILLS * skill_part + W_TITLE * title_part + W_LOCATION * loc_part))
    result = MatchResult(score=max(0, min(100, score)), matched_skills=matched)

    if prefs:
        if prefs.job_types and job.job_type and job.job_type not in prefs.job_types:
            result.eligible, result.reason = False, "job type"
        elif prefs.min_salary_lpa and job.salary_max_lpa and job.salary_max_lpa < prefs.min_salary_lpa:
            result.eligible, result.reason = False, "salary"
        elif wanted_locs and loc_part == 0.0:
            result.eligible, result.reason = False, "location"
    return result
