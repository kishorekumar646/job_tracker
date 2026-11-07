# Author: Kishore Kumar
"""Tests for platform_detector.detect_platform()."""
from __future__ import annotations

import pytest

from app.services.platform_detector import detect_platform


@pytest.mark.parametrize(
    "doc,expected",
    [
        # STB
        (
            {"runInfo": {"boxType": "TV"}, "activeDevice": {}},
            "STB",
        ),
        # Perseus Android — platformType=MOBILE, os=android
        (
            {"runInfo": {"platformType": "MOBILE"}, "activeDevice": {"platform": "android"}},
            "PERSEUS_ANDROID",
        ),
        # Perseus iOS — platformType=MOBILE, os=ios
        (
            {"runInfo": {"platformType": "MOBILE"}, "activeDevice": {"platform": "ios"}},
            "PERSEUS_IOS",
        ),
        # BrowserStack — deviceType=BROWSER
        (
            {"runInfo": {"deviceType": "BROWSER"}, "activeDevice": {}},
            "BROWSERSTACK",
        ),
        # BrowserStack — location=BROWSERSTACK
        (
            {"runInfo": {"location": "BROWSERSTACK"}, "activeDevice": {}},
            "BROWSERSTACK",
        ),
        # Unknown — empty doc
        (
            {"runInfo": {}, "activeDevice": {}},
            "UNKNOWN",
        ),
        # BrowserStack — real mobile device with BS_ name prefix
        (
            {"runInfo": {}, "activeDevice": {"name": "BS_SAMSUNG GALAXY TAB S10 PLUS-ANDROID-15.0#13", "platform": "android"}},
            "BROWSERSTACK",
        ),
        # BrowserStack — real mobile device with browserStackUrl present
        (
            {"runInfo": {}, "activeDevice": {"browserStackUrl": "https://app-automate.browserstack.com/builds/abc/sessions/xyz", "platform": "android"}},
            "BROWSERSTACK",
        ),
        # Unknown — malformed doc (no runInfo)
        (
            {},
            "UNKNOWN",
        ),
        # Case-insensitive OS hint
        (
            {"runInfo": {"deviceType": "MOBILE"}, "activeDevice": {"platform": "Android"}},
            "PERSEUS_ANDROID",
        ),
    ],
)
def test_detect_platform(doc, expected):
    assert detect_platform(doc) == expected



# ── Platform of an InspectorWeb run (routers/rca._infer_platform) ────────────

def _execution(inner: dict, **top):
    from datetime import datetime
    from app.models import ExecutionSummary
    return ExecutionSummary.model_validate({
        "type": "RUNCONFIG", "uuid_rc": "x", "name": top.pop("name", "FT_AVAD"), "status": "DONE", "status_id": 1,
        "error": None, "inserted": datetime(2026, 11, 1), "updated": datetime(2026, 11, 1), "run_info": None,
        "config": {"config": inner}, **top,
    })


def test_stb_run_without_platform_type_is_stb():
    """A set-top-box run whose device names carry no STB keyword used to come out as BROWSERSTACK."""
    from app.routers.rca import _infer_platform
    assert _infer_platform(_execution({"targets": ["OBO_HR02-12"]})) == "STB"


def test_wizard_selector_groups_are_read():
    from app.routers.rca import _infer_platform
    stb = _execution({"targets": [[{"type": "name", "value": "HArchive_021", "regex": False}]]})
    assert stb.targets == ["HArchive_021"] and _infer_platform(stb) == "STB"
    ott = _execution({"devices": [[{"type": "platform", "value": "android", "regex": False}]]})
    assert ott.targets == [] and _infer_platform(ott) == "PERSEUS_ANDROID"


def test_platform_type_and_browserstack_still_win():
    from app.routers.rca import _infer_platform
    assert _infer_platform(_execution({"platformType": "IOS", "targets": ["OBO_HR02-12"]})) == "PERSEUS_IOS"
    assert _infer_platform(_execution({"targets": ["OBO_HR02-12"]}, bs_execution_url="https://bs/x")) == "BROWSERSTACK"
