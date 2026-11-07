# Author: Kishore Kumar
# Regression: ISSUE-010 — POST /auth/signup stored date_of_birth without any validation
# Found by /qa on 2026-11-01
# Report: .gstack/qa-reports/run-20261101T031943Z/qa-report-rca-service-api-2026-11-01.md
"""Tests for POST /auth/signup date_of_birth validation."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

SIGNUP = "/api/v1/auth/signup"


@pytest.fixture
def client():
    # Patch the service so no request reaches the DB; the lifespan still runs as in test_routers_rca.py.
    with patch("app.auth.router.service.totp_setup", new_callable=AsyncMock) as setup:
        with TestClient(app) as c:
            c.totp_setup = setup
            yield c


@pytest.mark.parametrize("dob", ["2001-13-45", "not-a-date", "17/05/1990"])
def test_invalid_date_of_birth_rejected(client, dob):
    r = client.post(SIGNUP, data={"email": "qa-probe@infosys.com", "date_of_birth": dob})
    assert r.status_code == 422
    client.totp_setup.assert_not_called()


def test_valid_date_of_birth_accepted(client):
    r = client.post(SIGNUP, data={"email": "qa-probe@infosys.com", "date_of_birth": "1990-05-17"})
    assert r.status_code == 201
    assert client.totp_setup.call_args.kwargs["date_of_birth"] == "1990-05-17"


def test_date_of_birth_optional(client):
    r = client.post(SIGNUP, data={"email": "qa-probe@infosys.com"})
    assert r.status_code == 201
