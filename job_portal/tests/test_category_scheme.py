# Author: Kishore Kumar
"""Tests for the category scheme: LOGIC_BUG split, error-code details, stored-verdict migration."""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.report_html import build_report_html
from app.models import FailureRecord
from app.rules.common import js_runtime_error
from app.services import category_migration, rule_engine, verdict_aggregator


def _failure(message: str, platform: str = "STB") -> FailureRecord:
    return FailureRecord(
        testCaseRunId="cat-001",
        fullTitle="Category :: test",
        platform=platform,
        runInfo={},
        err={"message": message, "stack": None, "response": None},
        timestamp=datetime.now(tz=timezone.utc),
    )


# ── LOGIC_BUG split ───────────────────────────────────────────────────────────

def test_js_runtime_error_is_automation_script():
    result = js_runtime_error.explain(_failure("TypeError: foo is not a function"))
    assert result["category"] == "AUTOMATION_SCRIPT"


def test_cs_code_beats_generic_assertion_on_stb():
    """A CS code inside an AssertionError must classify by the code, not as TEST_ASSERTION."""
    result = rule_engine.evaluate(_failure("AssertionError: expected playing, got CS2201"))
    assert result["category"] == "NETWORK_ERROR"
    assert result["errorCode"] == "CS2201"


# ── Aggregator carries code details ───────────────────────────────────────────

def test_aggregator_keeps_code_details_on_rule_match():
    f = _failure("CS2201")
    v = verdict_aggregator.aggregate(f, rule_engine.evaluate(f), matched_ticket=None)
    assert (v.category, v.errorCode, v.errorSubsystem) == ("NETWORK_ERROR", "CS2201", "Multiroom / Recordings")


def test_aggregator_keeps_code_details_when_jira_wins():
    f = _failure("CS2201")
    v = verdict_aggregator.aggregate(f, rule_engine.evaluate(f), matched_ticket="BUG-1")
    assert v.category == "KNOWN_ISSUE"
    assert v.errorCode == "CS2201"


def test_aggregator_without_code_leaves_fields_empty():
    f = _failure("AssertionError: nope")
    v = verdict_aggregator.aggregate(f, rule_engine.evaluate(f), matched_ticket=None)
    assert v.category == "TEST_ASSERTION"
    assert v.errorCode is None


# ── Stored-verdict migration ──────────────────────────────────────────────────

def test_upgrade_splits_logic_bug_by_rule():
    verdicts = [
        {"category": "LOGIC_BUG", "matchedRule": "common.js_runtime_error"},
        {"category": "LOGIC_BUG", "matchedRule": "common.element_not_found"},
        {"category": "LOGIC_BUG", "matchedRule": "common.assertion_failure"},
        {"category": "LOGIC_BUG", "matchedRule": None},
        {"category": "ENVIRONMENT", "matchedRule": "common.perseus_error"},
    ]
    assert category_migration.upgrade_verdicts(verdicts) is True
    assert [v["category"] for v in verdicts] == [
        "AUTOMATION_SCRIPT", "AUTOMATION_SCRIPT", "TEST_ASSERTION", "TEST_ASSERTION", "ENVIRONMENT",
    ]


def test_upgrade_backfills_cs_code_details():
    verdicts = [{
        "category": "NETWORK_ERROR",
        "matchedRule": "stb.cs_error_lookup",
        "explanation": "STB CS error CS2201 (Multiroom / Recordings): STB on different network or subnet. ...",
    }]
    assert category_migration.upgrade_verdicts(verdicts) is True
    assert verdicts[0]["errorCode"] == "CS2201"
    assert verdicts[0]["errorTitle"] == "STB on different network or subnet"
    assert verdicts[0]["errorSubsystem"] == "Multiroom / Recordings"


def test_upgrade_rewords_legacy_explanations():
    verdicts = [
        {"category": "TEST_ASSERTION", "matchedRule": "common.assertion_failure",
         "explanation": "Test assertion failed — likely a logic bug or a test-data mismatch."},
        {"category": "AUTOMATION_SCRIPT", "matchedRule": "common.js_runtime_error",
         "explanation": "TypeError thrown during test execution: x. "
                        "This indicates a missing function, undefined variable, or module issue in the test or application code."},
    ]
    assert category_migration.upgrade_verdicts(verdicts) is True
    assert "logic bug" not in verdicts[0]["explanation"]
    assert verdicts[1]["explanation"].endswith("The automation script has a missing function, undefined variable, or module issue.")
    assert category_migration.upgrade_verdicts(verdicts) is False


def test_upgrade_is_idempotent():
    verdicts = [{"category": "LOGIC_BUG", "matchedRule": "common.assertion_failure"}]
    category_migration.upgrade_verdicts(verdicts)
    assert category_migration.upgrade_verdicts(verdicts) is False


def test_upgrade_summary_recounts_legacy_category():
    verdicts = [{"category": "TEST_ASSERTION"}, {"category": "AUTOMATION_SCRIPT"}, {"category": "TEST_ASSERTION"}]
    summary = {"byCategory": {"LOGIC_BUG": 3}, "byPlatform": {"STB": 3}}
    assert category_migration.upgrade_summary(summary, verdicts) is True
    assert summary == {"byCategory": {"TEST_ASSERTION": 2, "AUTOMATION_SCRIPT": 1}, "byPlatform": {"STB": 3}}
    assert category_migration.upgrade_summary(summary, verdicts) is False


# ── HTML report ───────────────────────────────────────────────────────────────

def test_report_shows_error_code_chip():
    verdict = {
        "testCaseRunId": "t1", "platform": "STB", "category": "NETWORK_ERROR", "confidence": 0.9,
        "explanation": "STB CS error CS2201", "matchedRule": "stb.cs_error_lookup",
        "errorCode": "CS2201", "errorTitle": "STB on different network or subnet",
        "errorSubsystem": "Multiroom / Recordings",
    }
    page = build_report_html({"status": "DONE"}, [verdict], "QA")
    assert "<code>CS2201</code> · Multiroom / Recordings · STB on different network or subnet" in page
