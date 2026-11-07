# Author: Kishore Kumar
"""Tests for STB rules: xap_call_failed, dvr_no_data."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models import FailureRecord
from app.rules.stb import xap_call_failed, dvr_no_data


def _make_stb(message: str, response: dict | None = None) -> FailureRecord:
    return FailureRecord(
        testCaseRunId="stb-run-001",
        fullTitle="STB :: playback :: some test",
        platform="STB",
        runInfo={"boxType": "ARRIS"},
        err={"message": message, "stack": None, "response": response},
        timestamp=datetime.now(tz=timezone.utc),
    )


class TestXapCallFailed:
    def test_matches_exact(self):
        f = _make_stb("XAP call failed: timeout")
        assert xap_call_failed.matches(f) is True

    def test_matches_case_insensitive(self):
        f = _make_stb("xap call failed with error code 42")
        assert xap_call_failed.matches(f) is True

    def test_no_match_unrelated_error(self):
        f = _make_stb("AssertionError: expected true but got false")
        assert xap_call_failed.matches(f) is False

    def test_no_match_empty_message(self):
        f = _make_stb("")
        assert xap_call_failed.matches(f) is False

    def test_explain_category(self):
        f = _make_stb("XAP call failed: network unreachable")
        result = xap_call_failed.explain(f)
        assert result["category"] == "ENVIRONMENT"
        assert result["confidence"] == 0.8
        assert result["matchedRule"] == "stb.xap_call_failed"


class TestDvrNoData:
    def test_matches_no_recordings_found(self):
        f = _make_stb("There where no recordings found at all")
        assert dvr_no_data.matches(f) is True

    def test_matches_no_recordings_found_variant(self):
        f = _make_stb("no recording found matching the criteria")
        assert dvr_no_data.matches(f) is True

    def test_matches_recording_id_undefined(self):
        f = _make_stb(
            "Required parameter: recordingId is undefined for method: "
            "Recording Service LDVR: getRecordingDetails"
        )
        assert dvr_no_data.matches(f) is True

    def test_matches_ldvr_service_error(self):
        f = _make_stb("Recording Service LDVR: getRecordingDetails failed")
        assert dvr_no_data.matches(f) is True

    def test_no_match_unrelated(self):
        f = _make_stb("XAP call failed: timeout")
        assert dvr_no_data.matches(f) is False

    def test_explain_no_recordings_category(self):
        f = _make_stb("There where no recordings found at all")
        result = dvr_no_data.explain(f)
        assert result["category"] == "ENVIRONMENT"
        assert result["confidence"] == 0.88
        assert result["matchedRule"] == "stb.dvr_no_data"
        assert "lab" in result["explanation"].lower()

    def test_explain_cascade_recordingid(self):
        f = _make_stb("Required parameter: recordingId is undefined for method: Recording Service LDVR: getRecordingDetails")
        result = dvr_no_data.explain(f)
        assert result["category"] == "ENVIRONMENT"
        assert "cascade" in result["explanation"].lower()

