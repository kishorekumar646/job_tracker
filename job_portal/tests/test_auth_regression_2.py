# Author: Kishore Kumar
# Regression: ISSUE-004 — PATCH /auth/me accepted a whitespace-only full_name
# Regression: ISSUE-005 — PATCH /auth/me stored impossible dates of birth (e.g. 2001-13-45)
# Found by /qa on 2026-11-01
# Report: .gstack/qa-reports/run-20261101T031943Z/qa-report-rca-service-api-2026-11-01.md
"""Tests for the PATCH /auth/me request body (UpdateProfileBody)."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.auth.router import UpdateProfileBody


@pytest.mark.parametrize("name", ["   ", "\t"])
def test_blank_full_name_rejected(name):
    with pytest.raises(ValidationError):
        UpdateProfileBody(full_name=name)


def test_full_name_is_stripped():
    assert UpdateProfileBody(full_name="  QA  ").full_name == "QA"


@pytest.mark.parametrize("dob", ["2001-13-45", "2001-02-30", "0000-00-00"])
def test_impossible_date_of_birth_rejected(dob):
    with pytest.raises(ValidationError):
        UpdateProfileBody(full_name="QA", date_of_birth=dob)


def test_valid_date_of_birth_accepted():
    assert UpdateProfileBody(full_name="QA", date_of_birth="2000-02-29").date_of_birth == "2000-02-29"
