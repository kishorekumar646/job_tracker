# Author: Kishore Kumar
"""Tests for rules covering failure patterns that used to fall through to UNKNOWN."""
from __future__ import annotations

from datetime import datetime, timezone

from app.models import FailureRecord
from app.rules.common import connection_refused, profile_navigation_failed, ui_stop_condition_timeout
from app.services import category_migration, rule_engine, verdict_aggregator

STOP_CONDITION = (
    "timeout: stopcondition [coPh_d5956d99-4412-406d-a39b-60a6d96cd86d~omw_playmore~en,"
    "coPh_d1af0f65-483c-4fab-8e5f-18fd9d99d7e9~omw_tv2~en] not met after [51] stop checks with key [down]"
)
ECONNREFUSED = '{"errno":-111,"code":"ECONNREFUSED","syscall":"connect","address":"10.64.1.20","port":8080}'


def _failure(message: str, platform: str = "STB", context: str | None = None) -> FailureRecord:
    return FailureRecord(
        testCaseRunId="unk-001",
        fullTitle="[XHZN4SI-34696] Watchlist Delete single SVOD STEP00030 Switch to the shared profile",
        platform=platform,
        runInfo={},
        err={"message": message, "stack": None, "response": None, "contextText": context},
        timestamp=datetime.now(tz=timezone.utc),
    )


# ── profile_navigation_failed ─────────────────────────────────────────────────

def test_profile_navigation_matches_report_message():
    f = _failure("Error: Unable to navigate to the requested profile.")
    assert profile_navigation_failed.matches(f)
    assert profile_navigation_failed.explain(f)["category"] == "ENVIRONMENT"


def test_profile_navigation_matches_context_only():
    f = _failure("", context="Unable to navigate to the requested profile.")
    assert profile_navigation_failed.matches(f)


def test_profile_navigation_ignores_other_errors():
    assert not profile_navigation_failed.matches(_failure("Unable to navigate to Personal Home"))


# ── ui_stop_condition_timeout ─────────────────────────────────────────────────

def test_stop_condition_matches_and_reports_presses():
    f = _failure(STOP_CONDITION)
    assert ui_stop_condition_timeout.matches(f)
    result = ui_stop_condition_timeout.explain(f)
    assert result["category"] == "ENVIRONMENT"
    assert "51 presses of [down]" in result["explanation"]


def test_stop_condition_ignores_plain_timeouts():
    assert not ui_stop_condition_timeout.matches(_failure("timeout of 2000ms exceeded"))


# ── connection_refused ────────────────────────────────────────────────────────

def test_connection_refused_reports_target():
    f = _failure(ECONNREFUSED)
    assert connection_refused.matches(f)
    result = connection_refused.explain(f)
    assert result["category"] == "NETWORK_ERROR"
    assert "ECONNREFUSED" in result["explanation"] and "10.64.1.20:8080" in result["explanation"]


def test_connection_refused_ignores_unrelated():
    assert not connection_refused.matches(_failure("AssertionError: refused to render"))


# ── Engine wiring ─────────────────────────────────────────────────────────────

def test_engine_classifies_reported_failure():
    result = rule_engine.evaluate(_failure("Error: Unable to navigate to the requested profile."))
    assert result["matchedRule"] == "common.profile_navigation_failed"


def test_unknown_verdict_keeps_error_text():
    f = _failure("Something brand new happened")
    v = verdict_aggregator.aggregate(f, None, matched_ticket=None)
    assert v.category == "UNKNOWN"
    assert v.explanation == "No matching rule. Error: Something brand new happened"


# ── Reclassifying stored UNKNOWN verdicts ─────────────────────────────────────

def test_migration_reclassifies_stored_unknowns():
    verdicts = [
        {"category": "UNKNOWN", "platform": "STB", "explanation": "No matching rule.",
         "failureErrors": [{"message": "Unable to navigate to the requested profile."}]},
        {"category": "UNKNOWN", "platform": "STB", "explanation": "No matching rule.",
         "stepReasons": [{"reason": STOP_CONDITION}]},
        {"category": "UNKNOWN", "platform": "STB", "explanation": f"No matching rule. Error: {ECONNREFUSED}"},
        {"category": "UNKNOWN", "platform": "STB", "explanation": "No matching rule."},
    ]
    summary = {"byCategory": {"UNKNOWN": 4}}
    assert category_migration.upgrade_verdicts(verdicts) is True
    assert [v["category"] for v in verdicts] == ["ENVIRONMENT", "ENVIRONMENT", "NETWORK_ERROR", "UNKNOWN"]
    assert category_migration.upgrade_summary(summary, verdicts, force=True) is True
    assert summary["byCategory"] == {"ENVIRONMENT": 2, "NETWORK_ERROR": 1, "UNKNOWN": 1}
    assert category_migration.upgrade_verdicts(verdicts) is False


def test_migration_leaves_ai_suggested_unknowns():
    verdicts = [{"category": "UNKNOWN", "aiSuggested": True, "platform": "STB",
                 "explanation": "Unable to navigate to the requested profile."}]
    assert category_migration.upgrade_verdicts(verdicts) is False
