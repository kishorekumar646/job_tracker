"""
Author: Kishore Kumar
Live job feed from free, keyless public APIs (Remotive, Arbeitnow), plus Adzuna when keys are set.

Feed jobs are stored once in the shared catalogue with ``external_id = <provider>-<id>``
and source ``other``; ``job_url`` is the real posting the user applies on. Remotive's terms
require linking back and crediting them, so those descriptions carry a source line.
"""

import html
import logging
import re
import ssl
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import settings
from ..models import Job, JobPreference
from .skills import extract_skills

logger = logging.getLogger("job_portal.job_feed")

_API = "https://api.adzuna.com/v1/api/jobs/{country}/search/1"
_MAX_QUERIES = 5


def _ssl_context() -> ssl.SSLContext:
    # The OS trust store also covers corporate proxies whose CA isn't in certifi.
    try:
        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        return ssl.create_default_context()


FEED_PREFIXES = ("adzuna-", "remotive-", "arbeitnow-")
_TAGS = re.compile(r"<[^>]+>")


def feed_configured() -> bool:
    """Free providers need no keys, so the feed is always available."""
    return True


def _adzuna_enabled() -> bool:
    return bool(settings.ADZUNA_APP_ID and settings.ADZUNA_APP_KEY)


def _plain(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAGS.sub(" ", text or ""))).strip()[:4000]


def _job_type(item: dict) -> Optional[str]:
    if item.get("contract_type") == "contract":
        return "contract"
    return {"full_time": "full_time", "part_time": "part_time"}.get(item.get("contract_time") or "")


def _lpa(value) -> Optional[float]:
    # Adzuna reports annual salary in the local currency; INR -> lakhs per annum.
    return round(float(value) / 100_000, 1) if value and settings.ADZUNA_COUNTRY == "in" else None


def _to_job(item: dict) -> Optional[Job]:
    url, title = item.get("redirect_url"), (item.get("title") or "").strip()
    if not url or not title or item.get("id") is None:
        return None
    description = (item.get("description") or "").strip()
    location = (item.get("location") or {}).get("display_name")
    posted = None
    try:
        posted = datetime.fromisoformat((item.get("created") or "").replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        pass
    return Job(
        external_id=f"adzuna-{item['id']}", title=title[:200],
        company=((item.get("company") or {}).get("display_name") or "Unknown company")[:200],
        location=location, is_remote="remote" in f"{title} {location or ''} {description}".lower(),
        description=description, skills=extract_skills(f"{title} {description}"),
        job_type=_job_type(item), source="other", job_url=url, posted_date=posted,
        salary_min_lpa=_lpa(item.get("salary_min")), salary_max_lpa=_lpa(item.get("salary_max")),
    )


async def _fetch_adzuna(client: httpx.AsyncClient, what: str, where: str) -> list[dict]:
    params = {
        "app_id": settings.ADZUNA_APP_ID, "app_key": settings.ADZUNA_APP_KEY,
        "what": what, "results_per_page": 30, "sort_by": "date", "content-type": "application/json",
    }
    if where:
        params["where"] = where
    resp = await client.get(_API.format(country=settings.ADZUNA_COUNTRY), params=params)
    resp.raise_for_status()
    return resp.json().get("results", [])


def _remotive_job(item: dict) -> Optional[Job]:
    url, title = item.get("url"), (item.get("title") or "").strip()
    if not url or not title or item.get("id") is None:
        return None
    description = _plain(item.get("description"))
    posted = None
    try:
        posted = datetime.fromisoformat(item.get("publication_date") or "")
    except ValueError:
        pass
    tags = " ".join(item.get("tags") or [])
    return Job(
        external_id=f"remotive-{item['id']}", title=title[:200], company=(item.get("company_name") or "Unknown company")[:200],
        location=item.get("candidate_required_location") or "Remote", is_remote=True,
        description=f"{description}\n\nSource: Remotive ({url})", skills=extract_skills(f"{title} {tags} {description}"),
        job_type={"full_time": "full_time", "part_time": "part_time", "contract": "contract", "internship": "internship"}.get(item.get("job_type") or ""),
        source="other", job_url=url, posted_date=posted,
    )


def _arbeitnow_job(item: dict) -> Optional[Job]:
    url, title = item.get("url"), (item.get("title") or "").strip()
    if not url or not title or not item.get("slug"):
        return None
    description = _plain(item.get("description"))
    kinds = " ".join(item.get("job_types") or []).lower()
    return Job(
        external_id=f"arbeitnow-{item['slug']}"[:120], title=title[:200], company=(item.get("company_name") or "Unknown company")[:200],
        location=item.get("location"), is_remote=bool(item.get("remote")),
        description=f"{description}\n\nSource: Arbeitnow", skills=extract_skills(f"{title} {' '.join(item.get('tags') or [])} {description}"),
        job_type="internship" if "intern" in kinds else "part_time" if "part" in kinds else "full_time" if "full" in kinds else None,
        source="other", job_url=url,
        posted_date=datetime.utcfromtimestamp(item["created_at"]) if isinstance(item.get("created_at"), (int, float)) else None,
    )


async def _new_jobs(client: httpx.AsyncClient, titles: list[str], locations: list[str]) -> list[Job]:
    jobs: list[Job] = []
    for title in titles[:_MAX_QUERIES]:
        try:
            resp = await client.get("https://remotive.com/api/remote-jobs", params={"search": title, "limit": 30})
            resp.raise_for_status()
            jobs += [j for j in map(_remotive_job, resp.json().get("jobs", [])) if j]
        except (httpx.HTTPError, ValueError):
            logger.warning("remotive request failed for %r", title)
        if _adzuna_enabled():
            for where in (locations[:2] or [""]):
                try:
                    jobs += [j for j in map(_to_job, await _fetch_adzuna(client, title, where)) if j]
                except httpx.HTTPError:
                    logger.warning("adzuna request failed for %r", title)
    try:
        resp = await client.get("https://www.arbeitnow.com/api/job-board-api")
        resp.raise_for_status()
        terms = [w for t in titles for w in re.findall(r"[a-z+#.]{3,}", t.lower())]
        for item in resp.json().get("data", []):
            if terms and not any(w in f"{item.get('title', '')} {' '.join(item.get('tags') or [])}".lower() for w in terms):
                continue
            job = _arbeitnow_job(item)
            if job:
                jobs.append(job)
    except (httpx.HTTPError, ValueError):
        logger.warning("arbeitnow request failed")
    return jobs


async def sync_feed(db: AsyncSession, titles: list[str], locations: list[str]) -> int:
    """Fetch postings for the given titles; returns how many new jobs were stored."""
    if not titles:
        return 0
    async with httpx.AsyncClient(timeout=15, verify=_ssl_context(), headers={"User-Agent": "JobPilot/1.0"}) as client:
        fetched = await _new_jobs(client, titles, locations)
    added, seen = 0, set()
    for job in fetched:
        if job.external_id in seen or await db.scalar(select(Job.id).where(Job.external_id == job.external_id)):
            continue
        seen.add(job.external_id)
        db.add(job)
        added += 1
    await db.commit()
    return added


async def sync_for_preferences(db: AsyncSession, prefs: Optional[JobPreference]) -> int:
    if not prefs:
        return 0
    return await sync_feed(db, list(prefs.job_titles or []), list(prefs.locations or []))
