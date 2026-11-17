"""
Author: Kishore Kumar
Plan rules: a paid plan only counts while it has not expired.
"""

from datetime import datetime, timedelta

from ..database import settings
from ..models import User


def effective_plan(user: User) -> str:
    if user.plan == "pro" and user.plan_expires_at and user.plan_expires_at > datetime.utcnow():
        return "pro"
    return "free"


def daily_apply_cap(user: User) -> int:
    return settings.PRO_DAILY_APPLY_LIMIT


def lifetime_apply_cap(user: User) -> int | None:
    """Free accounts get a fixed number of auto-applies in total; Pro is limited per day only."""
    return None if effective_plan(user) == "pro" else settings.FREE_TOTAL_APPLY_LIMIT


def grant_pro(user: User) -> None:
    now = datetime.utcnow()
    if user.plan == "pro" and user.plan_expires_at and user.plan_expires_at > now:
        base = user.plan_expires_at
    else:
        base = now
        user.pro_welcome_pending = True
    user.plan, user.plan_expires_at = "pro", base + timedelta(days=settings.PRO_DAYS)
