# Author: Kishore Kumar
"""Tests for Perseus iOS rules."""
from __future__ import annotations

from datetime import datetime, timezone

from app.models import FailureRecord
from app.rules.perseus_ios import playout_error_lookup


def _make_ios(error_code: str | None = None, message: str = "playout failed") -> FailureRecord:
    response = {"errorCode": error_code} if error_code is not None else None
    return FailureRecord(
        testCaseRunId="ios-run-001",
        fullTitle="Perseus iOS :: playback :: drm test",
        platform="PERSEUS_IOS",
        runInfo={"platformType": "MOBILE"},
        activeDevice={"platform": "ios"},
        err={"message": message, "stack": None, "response": response},
        timestamp=datetime.now(tz=timezone.utc),
    )


class TestIosPlayoutErrorLookup:
    def test_matches_drm_error_code(self):
        f = _make_ios("1001")
        assert playout_error_lookup.matches(f) is True

    def test_matches_playout_error_code(self):
        f = _make_ios("2002")
        assert playout_error_lookup.matches(f) is True

    def test_no_match_unknown_code(self):
        f = _make_ios("8888")
        assert playout_error_lookup.matches(f) is False

    def test_no_match_no_response(self):
        f = _make_ios(None)
        assert playout_error_lookup.matches(f) is False

    def test_explain_drm_category(self):
        f = _make_ios("1002")
        result = playout_error_lookup.explain(f)
        assert result["category"] == "DRM_ERROR"
        assert result["confidence"] == 0.85
        assert result["matchedRule"] == "perseus_ios.playout_error_lookup"

    def test_explain_playout_category(self):
        f = _make_ios("2001")
        result = playout_error_lookup.explain(f)
        assert result["category"] == "PLAYOUT_ERROR"

