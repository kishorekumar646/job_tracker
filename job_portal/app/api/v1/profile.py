"""
Author: Kishore Kumar
Profile, resume and preference routes, mounted at ``/api/v1``.

    GET/PUT    /profile            candidate details and skills
    POST       /profile/resume     upload PDF/DOCX/TXT; skills are extracted
    GET        /profile/resume     download the stored resume
    DELETE     /profile/resume     remove resume (skills are kept)
    POST/DELETE /profile/avatar    replace or remove your profile photo
    GET/PUT    /preferences        preferred titles, locations, auto-apply settings
"""

import os
import re
import mimetypes
import base64
from io import BytesIO
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db, settings
from ...deps import get_current_user
from ...models import JobPreference, User, UserProfile
from ...schemas import GuideClaim, PreferencesOut, PreferencesUpdate, ProfileOut, ProfileUpdate, UserOut
from ...services.presenters import profile_out
from ...services.skills import ResumeError, canonical_skill, extract_resume_text, extract_skills

router = APIRouter(tags=["profile"])


@router.post("/profile/guide", response_model=GuideClaim)
async def claim_guide(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(update(User).where(
        User.id == user.id, User.guide_views < 2,
    ).values(guide_views=User.guide_views + 1).returning(User.guide_views))
    shown = result.scalar_one_or_none()
    await db.commit()
    return GuideClaim(show=shown is not None, shown=shown if shown is not None else user.guide_views)


def _avatar_data_uri(data: bytes) -> str:
    try:
        with Image.open(BytesIO(data)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(422, "Choose a JPG, PNG or WebP photo")
            if source.width * source.height > 16_000_000:
                raise HTTPException(422, "Photo must be at most 16 megapixels")
            image = ImageOps.exif_transpose(source)
            image.thumbnail((256, 256))
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, "white")
            background.paste(rgba, mask=rgba.getchannel("A"))
            output = BytesIO()
            background.save(output, format="JPEG", quality=85)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Photo could not be read. Choose a valid JPG, PNG or WebP image.") from exc
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


@router.post("/profile/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    data = await file.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(413, "Photo must be 2 MB or smaller")
    if not data:
        raise HTTPException(422, "Choose a non-empty photo")
    user.avatar = await run_in_threadpool(_avatar_data_uri, data)
    await db.commit()
    return UserOut.model_validate(user)


@router.delete("/profile/avatar", response_model=UserOut)
async def delete_avatar(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    user.avatar = None
    await db.commit()
    return UserOut.model_validate(user)


async def get_or_create_profile(db: AsyncSession, user: User) -> UserProfile:
    profile = await db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if not profile:
        profile = UserProfile(user_id=user.id, skills=[])
        db.add(profile)
        await db.flush()
    return profile


async def get_or_create_prefs(db: AsyncSession, user: User) -> JobPreference:
    prefs = await db.scalar(select(JobPreference).where(JobPreference.user_id == user.id))
    if not prefs:
        prefs = JobPreference(user_id=user.id, job_titles=[], locations=[], job_types=[])
        db.add(prefs)
        await db.flush()
    return prefs


def _remove_file(path: str | None) -> None:
    if path:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


@router.get("/profile", response_model=ProfileOut)
async def get_profile(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    profile = await get_or_create_profile(db, user)
    prefs = await get_or_create_prefs(db, user)
    await db.commit()
    return profile_out(profile, prefs)


@router.put("/profile", response_model=ProfileOut)
async def update_profile(
    body: ProfileUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    profile = await get_or_create_profile(db, user)
    prefs = await get_or_create_prefs(db, user)
    data = body.model_dump(exclude_unset=True)
    if "skills" in data and data["skills"] is not None:
        # Re-clean after canonicalising so "reactjs" and "React" don't both appear.
        seen, skills = set(), []
        for s in data["skills"]:
            c = canonical_skill(s)
            if c.lower() not in seen:
                seen.add(c.lower())
                skills.append(c)
        data["skills"] = skills
    for key, value in data.items():
        if key == "skills" and value is None:
            continue
        setattr(profile, key, value)
    await db.commit()
    await db.refresh(profile)
    return profile_out(profile, prefs)


@router.post("/profile/resume", response_model=ProfileOut)
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    max_bytes = settings.MAX_RESUME_MB * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Resume must be under {settings.MAX_RESUME_MB} MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")

    original = os.path.basename(file.filename or "resume")
    try:
        text = extract_resume_text(original, data)
    except ResumeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))

    profile = await get_or_create_profile(db, user)
    prefs = await get_or_create_prefs(db, user)
    _remove_file(profile.resume_path)

    detected = extract_skills(text)
    merged = list(profile.skills or [])
    known = {s.lower() for s in merged}
    merged += [s for s in detected if s.lower() not in known]

    profile.resume_filename = re.sub(r"[^\w.\- ]", "_", original)[:120]
    profile.resume_path = None
    profile.resume_data = data
    profile.resume_text = text
    profile.resume_size = len(data)
    profile.resume_uploaded_at = datetime.utcnow()
    profile.skills = merged[:60]
    await db.commit()
    await db.refresh(profile)
    return profile_out(profile, prefs)


@router.get("/profile/resume")
async def download_resume(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    profile = await get_or_create_profile(db, user)
    await db.refresh(profile, attribute_names=["resume_data"])
    if profile.resume_data is not None:
        filename = profile.resume_filename or "resume"
        return Response(
            profile.resume_data, media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename*=utf-8''{quote(filename, safe='')}", "Cache-Control": "no-store"},
        )
    if not profile.resume_path or not os.path.exists(profile.resume_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No resume uploaded")
    return FileResponse(profile.resume_path, filename=profile.resume_filename or "resume", headers={"Cache-Control": "no-store"})


@router.delete("/profile/resume", response_model=ProfileOut)
async def delete_resume(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    profile = await get_or_create_profile(db, user)
    prefs = await get_or_create_prefs(db, user)
    _remove_file(profile.resume_path)
    profile.resume_filename = profile.resume_path = profile.resume_text = None
    profile.resume_data = None
    profile.resume_size = profile.resume_uploaded_at = None
    await db.commit()
    return profile_out(profile, prefs)


@router.get("/preferences", response_model=PreferencesOut)
async def get_preferences(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    prefs = await get_or_create_prefs(db, user)
    await db.commit()
    return PreferencesOut.model_validate(prefs, from_attributes=True)


@router.put("/preferences", response_model=PreferencesOut)
async def update_preferences(
    body: PreferencesUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)
):
    prefs = await get_or_create_prefs(db, user)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None and key != "min_salary_lpa":
            continue
        setattr(prefs, key, value)
    await db.commit()
    await db.refresh(prefs)
    return PreferencesOut.model_validate(prefs, from_attributes=True)
