"""Job Tracker app package."""
from . import models
from . import schemas
from . import crud
from . import auth
from . import database
from . import totp
from . import api

# Create tables on import if needed
async def init_db():
    from .database import async_engine, Base
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

__all__ = ["models", "schemas", "crud", "auth", "database", "totp", "api"]