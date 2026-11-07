# Author: Kishore Kumar
"""Tests for BrowserStack rules."""
from __future__ import annotations

from datetime import datetime, timezone

from app.models import FailureRecord
from app.rules.browserstack import (
    appium_timeout,
    plan_limit,
    session_not_created,
    web_playout_error_lookup,
)


def _make_bs(
    message: str = "",
    device_type: str = "BROWSER",
    error_code: str | None = None,
) -> FailureRecord:
    response = {"errorCode": error_code} if error_code is not None else None
    return FailureRecord(
        testCaseRunId="bs-run-001",
        fullTitle="BrowserStack :: web :: some test",
        platform="BROWSERSTACK",
        runInfo={"location": "BROWSERSTACK", "deviceType": device_type},
        err={"message": message, "stack": None, "response": response},
        timestamp=datetime.now(tz=timezone.utc),
    )


class TestPlanLimit:
    def test_matches_plan_limit(self):
        assert plan_limit.matches(_make_bs("You have exceeded your plan limit")) is True

    def test_matches_no_devices(self):
        assert plan_limit.matches(_make_bs("No device available right now")) is True

    def test_matches_queue(self):
        assert plan_limit.matches(_make_bs("Added to queue")) is True

    def test_no_match(self):
        assert plan_limit.matches(_make_bs("AssertionError: expected 1 got 2")) is False

    def test_explain_category(self):
        r = plan_limit.explain(_make_bs("plan limit reached"))
        assert r["category"] == "BROWSERSTACK_CAPACITY"
        assert r["confidence"] == 0.75


class TestSessionNotCreated:
    def test_matches_session_not_created(self):
        assert session_not_created.matches(_make_bs("session not created")) is True

    def test_matches_chrome_not_reachable(self):
        assert session_not_created.matches(_make_bs("Chrome not reachable")) is True

    def test_no_match(self):
        assert session_not_created.matches(_make_bs("timeout waiting for element")) is False

    def test_explain_category(self):
        r = session_not_created.explain(_make_bs("session not created exception"))
        assert r["category"] == "ENVIRONMENT"
        assert r["confidence"] == 0.8


class TestAppiumTimeout:
    def test_matches_timeout_mobile(self):
        f = _make_bs("Timeout waiting for app to launch", device_type="mobile")
        assert appium_timeout.matches(f) is True

    def test_no_match_timeout_browser(self):
        # device_type is BROWSER, not mobile
        f = _make_bs("Timeout error occurred", device_type="BROWSER")
        assert appium_timeout.matches(f) is False

    def test_no_match_no_timeout_mobile(self):
        f = _make_bs("AssertionError: unexpected element", device_type="mobile")
        assert appium_timeout.matches(f) is False

    def test_explain_category(self):
        f = _make_bs("command timeout", device_type="mobile")
        r = appium_timeout.explain(f)
        assert r["category"] == "ENVIRONMENT"
        assert r["confidence"] == 0.6


class TestWebPlayoutErrorLookup:
    def test_matches_drm_code(self):
        assert web_playout_error_lookup.matches(_make_bs(error_code="1001")) is True

    def test_matches_playout_code(self):
        assert web_playout_error_lookup.matches(_make_bs(error_code="2001")) is True

    def test_no_match_unknown_code(self):
        assert web_playout_error_lookup.matches(_make_bs(error_code="7777")) is False

    def test_explain_drm(self):
        r = web_playout_error_lookup.explain(_make_bs(error_code="1001"))
        assert r["category"] == "DRM_ERROR"

    def test_explain_playout(self):
        r = web_playout_error_lookup.explain(_make_bs(error_code="2001"))
        assert r["category"] == "PLAYOUT_ERROR"

