"""Application routes."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db
from ...models import Application
from ...schemas import ApplicationCreate, ApplicationResponse
from ...crud import create_application, get_user_applications

router = APIRouter(prefix="/applications", tags=["applications"])


@router.post("/", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_new_application(
    application_data: ApplicationCreate,
    db: AsyncSession = Depends(get_async_db),
):
    """Create a new job application."""
    # In a real implementation, we'd get user_id from auth
    user_id = 1  # Placeholder
    application = await create_application(db, application_data, user_id)
    return application


@router.get("/", response_model=List[ApplicationResponse])
async def list_my_applications(
    db: AsyncSession = Depends(get_async_db),
):
    """Get all applications for current user."""
    # In a real implementation, we'd get user_id from auth
    user_id = 1  # Placeholder
    applications = await get_user_applications(db, user_id)
    return applications