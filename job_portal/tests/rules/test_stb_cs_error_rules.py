# Author: Kishore Kumar
"""Tests for STB rule: cs_error_lookup."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models import FailureRecord
from app.rules.stb import cs_error_lookup


def _make_stb(message: str) -> FailureRecord:
    return FailureRecord(
        testCaseRunId="stb-run-cs-001",
        fullTitle="STB :: cs_error :: test",
        platform="STB",
        runInfo={"boxType": "ARRIS"},
        err={"message": message, "stack": None, "response": None},
        timestamp=datetime.now(tz=timezone.utc),
    )


class TestCsErrorLookupMatches:
    def test_matches_fti_network_error(self):
        assert cs_error_lookup.matches(_make_stb("Fatal error CS1001 occurred")) is True

    def test_matches_drm_error(self):
        assert cs_error_lookup.matches(_make_stb("CS2010: conditional access failure")) is True

    def test_matches_nagra_code(self):
        assert cs_error_lookup.matches(_make_stb("Error CS100:70 from Nagra")) is True

    def test_matches_software_update_error(self):
        assert cs_error_lookup.matches(_make_stb("CS7506 install failed")) is True

    def test_matches_network_offline(self):
        assert cs_error_lookup.matches(_make_stb("Offline mode CS9004")) is True

    def test_matches_ott_error(self):
        assert cs_error_lookup.matches(_make_stb("CS2401 app store not responding")) is True

    def test_no_match_unknown_code(self):
        assert cs_error_lookup.matches(_make_stb("CS9999 unknown error")) is False

    def test_no_match_unrelated_message(self):
        assert cs_error_lookup.matches(_make_stb("AssertionError: expected true")) is False

    def test_no_match_empty_message(self):
        assert cs_error_lookup.matches(_make_stb("")) is False


class TestCsErrorLookupExplain:
    def test_explains_drm_error(self):
        result = cs_error_lookup.explain(_make_stb("CS2010 decryption failure"))
        assert result["category"] == "DRM_ERROR"
        assert result["confidence"] == 0.9
        assert result["matchedRule"] == "stb.cs_error_lookup"
        assert "CS2010" in result["explanation"]

    def test_explains_network_error(self):
        result = cs_error_lookup.explain(_make_stb("CS1001 NTP not reachable"))
        assert result["category"] == "NETWORK_ERROR"

    def test_explains_software_update_error(self):
        result = cs_error_lookup.explain(_make_stb("CS7506 forced update failed"))
        assert result["category"] == "SOFTWARE_UPDATE_ERROR"

    def test_explains_provisioning_error(self):
        result = cs_error_lookup.explain(_make_stb("CS1010 Traxis is unavailable"))
        assert result["category"] == "PROVISIONING_ERROR"

    def test_explains_hardware_error(self):
        result = cs_error_lookup.explain(_make_stb("CS1150 HDD spin up failure"))
        assert result["category"] == "HARDWARE_ERROR"

    def test_explains_backend_error(self):
        result = cs_error_lookup.explain(_make_stb("CS6001 recording request failed"))
        assert result["category"] == "BACKEND_ERROR"

    def test_explains_playout_error(self):
        result = cs_error_lookup.explain(_make_stb("CS2512 replay content not found"))
        assert result["category"] == "PLAYOUT_ERROR"

    def test_explains_account_error(self):
        result = cs_error_lookup.explain(_make_stb("CS6100 account suspended"))
        assert result["category"] == "ACCOUNT_ERROR"

    def test_explains_ott_error(self):
        result = cs_error_lookup.explain(_make_stb("CS2400 app cannot be launched"))
        assert result["category"] == "OTT_ERROR"

    def test_explains_nagra_drm(self):
        result = cs_error_lookup.explain(_make_stb("CS100:70 Nagra error"))
        assert result["category"] == "DRM_ERROR"
        assert "CS100:70" in result["explanation"]

    def test_first_code_wins(self):
        # When two CS codes appear, the first one takes precedence
        result = cs_error_lookup.explain(_make_stb("CS1001 then CS2010"))
        assert result["category"] == "NETWORK_ERROR"


class TestCsErrorLookupCodeDetails:
    def test_cs2201_is_network_error_with_code_details(self):
        """CS2201 must come out as NETWORK_ERROR with its code, title and subsystem."""
        result = cs_error_lookup.explain(_make_stb("AssertionError: playback failed CS2201"))
        assert result["category"] == "NETWORK_ERROR"
        assert result["errorCode"] == "CS2201"
        assert result["errorTitle"] == "STB on different network or subnet"
        assert result["errorSubsystem"] == "Multiroom / Recordings"

    def test_code_details_uppercase_the_code(self):
        result = cs_error_lookup.explain(_make_stb("error cs2010 seen"))
        assert result["errorCode"] == "CS2010"

    def test_lookup_is_case_insensitive(self):
        assert cs_error_lookup.lookup("cs2201")["category"] == "NETWORK_ERROR"
        assert cs_error_lookup.lookup("CS9999") is None

