"""
Author: Kishore Kumar
Promote a user to the admin role.

Usage:
    python tools/make_admin.py <email>

Run from the rca_service/ directory. The user must have already signed up
and activated their account before running this script.
"""
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "rca_auth.db"


def make_admin(email: str) -> None:
    email = email.strip().lower()
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        sys.exit(1)

    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT id, role, is_active FROM users WHERE email = ?", (email,)
        ).fetchone()

        if not row:
            print(f"No account found for {email}. Sign up and activate first.")
            sys.exit(1)

        user_id, current_role, is_active = row

        if not is_active:
            print(f"Account {email} is not activated yet. Activate it first.")
            sys.exit(1)

        if current_role == "admin":
            print(f"{email} is already an admin.")
            sys.exit(0)

        # Admins are never waiting for approval.
        conn.execute("UPDATE users SET role = 'admin', is_approved = 1 WHERE id = ?", (user_id,))
        print(f"Done — {email} is now an admin. Log out and back in for the change to take effect.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python tools/make_admin.py <email>")
        sys.exit(1)
    make_admin(sys.argv[1])
