"""
Author: Kishore Kumar
Promote an existing user to admin:  python tools/make_admin.py you@gmail.com
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import async_session_factory  # noqa: E402
from app.models import User  # noqa: E402


async def main(email: str) -> int:
    async with async_session_factory() as db:
        user = await db.scalar(select(User).where(User.email == email.lower()))
        if not user:
            print(f"No user with email {email}. Sign up and activate first.")
            return 1
        user.role = "admin"
        user.is_admin = True
        await db.commit()
        print(f"{user.email} is now an admin. Sign out and in again to pick up the new role.")
        return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python tools/make_admin.py <email>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
