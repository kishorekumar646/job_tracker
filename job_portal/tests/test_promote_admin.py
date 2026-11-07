"""
Author: Kishore Kumar
Promotes a hardcoded email to the admin role directly in the SQLite DB.

Run manually when you need to bootstrap the first admin or recover access:

    pytest tests/test_promote_admin.py -v -s

Change ADMIN_EMAIL below before running. The test is skipped automatically
during normal test runs, so it never fires by accident.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

# ── Configure this before running ─────────────────────────────────────────────
pytestmark = pytest.mark.skip(reason="Manual bootstrap — remove skip to run")


ADMIN_EMAIL = "user@example.com"  # replace with the target email before running
# ──────────────────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "rca_auth.db"



def test_promote_to_admin() -> None:
    assert DB_PATH.exists(), (
        f"Database not found at {DB_PATH}. "
        "Start the service at least once so the DB is created."
    )

    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT id, role FROM users WHERE email = ?", (ADMIN_EMAIL,)
        ).fetchone()

        assert row is not None, (
            f"No user found with email '{ADMIN_EMAIL}'. "
            "Create the account first via POST /api/v1/auth/signup or the Add User modal."
        )

        user_id, current_role = row
        if current_role == "admin":
            print(f"\n[ok] {ADMIN_EMAIL} is already an admin (id={user_id}).")
            return

        conn.execute(
            "UPDATE users SET role = 'admin' WHERE email = ?", (ADMIN_EMAIL,)
        )
        conn.commit()
        print(f"\n[ok] {ADMIN_EMAIL} promoted to admin (id={user_id}). "
              "Log out and back in for the change to take effect.")
    finally:
        conn.close()
