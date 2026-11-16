"""Author: Kishore Kumar. Authenticated product feedback."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_async_db
from ...deps import get_current_user
from ...models import Feedback, User
from ...schemas import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut, status_code=201)
async def submit_feedback(
    body: FeedbackCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db),
):
    feedback = Feedback(user_id=user.id, **body.model_dump())
    db.add(feedback)
    await db.commit()
    return feedback
