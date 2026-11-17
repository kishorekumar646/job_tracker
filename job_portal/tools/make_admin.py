"""
Author: Kishore Kumar
Promote an activated user after verifying their authenticator code.
"""

import asyncio
from getpass import getpass
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.exc import SQLAlchemyError  # noqa: E402
from pydantic import EmailStr, TypeAdapter, ValidationError  # noqa: E402

from app.auth import auth_manager  # noqa: E402
from app.database import async_engine, async_session_factory  # noqa: E402
from app.models import User  # noqa: E402


async def main(email: str, otp: str) -> int:
    email = email.strip().lower()
    try:
        email = TypeAdapter(EmailStr).validate_python(email)
    except ValidationError:
        print("Enter a complete email address, for example user@gmail.com. No changes made.", file=sys.stderr)
        return 1
    if not re.fullmatch(r"[0-9]{6}", otp):
        print("Enter a 6-digit authenticator code. No changes made.", file=sys.stderr)
        return 1
    async with async_session_factory() as db:
        user = await db.scalar(select(User).where(User.email == email))
        if not user:
            print(f"No user with email {email}. Sign up and activate first.", file=sys.stderr)
            print("If this account exists in production, check that DATABASE_URL points to the same Supabase database as Render.", file=sys.stderr)
            return 1
        if not user.is_approved or not user.is_active:
            print("Only activated, active accounts can become admins.", file=sys.stderr)
            return 1
        if not auth_manager.verify_totp(user.totp_secret, otp):
            print("Invalid or expired authenticator code. No changes made.", file=sys.stderr)
            return 1
        user.role = "admin"
        user.is_admin = True
        await db.commit()
        print(f"{user.email} is now an admin. Sign out and in again to pick up the new role.")
        return 0


def cli() -> int:
    if len(sys.argv) > 2:
        print("usage: python createsuperuser [email]", file=sys.stderr)
        return 2
    try:
        backend = async_engine.url.get_backend_name()
        if backend == "sqlite":
            print("Database: local SQLite. Production Supabase accounts will not be found here.")
        else:
            print(f"Database: {backend} (using the configured DATABASE_URL).")
        email = sys.argv[1] if len(sys.argv) == 2 else input("Enter Email: ")
        otp = getpass("Authenticator Code: ").strip()
        return asyncio.run(main(email, otp))
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled.", file=sys.stderr)
        return 1
    except SQLAlchemyError:
        print("Database operation failed. Check DATABASE_URL and database availability, then retry.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(cli())
