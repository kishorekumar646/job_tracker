# Author: Kishore Kumar
"""Tests for app/rules/common/*.py rule modules."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models import FailureRecord
from app.rules.common import (
    assertion_failure,
    element_not_found,
    inspector_session_terminated,
    no_devices_available,
    required_assertion_failed,
    return_to_live_tv_failed,
    rmq_rpc_timeout,
)


def _make_failure(message: str, platform: str = "STB") -> FailureRecord:
    return FailureRecord(
        testCaseRunId="tcr-test",
        fullTitle="Suite :: some test",
        platform=platform,
        runInfo={"platformType": platform},
        err={"message": message, "stack": None, "response": None},
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


# ── no_devices_available ───────────────────────────────────────────────────────

class TestNoDevicesAvailableRule:

    # Real captured error string from a lab STB/AppleTV grid target (2026-08-28)
    _REAL_ERROR = (
        "RunParallelError: No more devices available for this execution. Detail: []"
    )

    def test_matches_real_captured_error(self):
        failure = _make_failure(self._REAL_ERROR)
        assert no_devices_available.matches(failure) is True

    def test_matches_singular_device(self):
        failure = _make_failure("No more device available for this run.")
        assert no_devices_available.matches(failure) is True

    def test_case_insensitive(self):
        failure = _make_failure("no more devices available")
        assert no_devices_available.matches(failure) is True

    def test_does_not_match_unrelated_error(self):
        failure = _make_failure("AssertionError: expected true to equal false")
        assert no_devices_available.matches(failure) is False

    def test_does_not_match_empty_message(self):
        failure = _make_failure("")
        assert no_devices_available.matches(failure) is False

    def test_explain_returns_environment_category(self):
        failure = _make_failure(self._REAL_ERROR)
        result = no_devices_available.explain(failure)
        assert result["category"] == "ENVIRONMENT"
        assert result["confidence"] == 0.9
        assert result["matchedRule"] == "common.no_devices_available"
        assert "available" in result["explanation"].lower()

    def test_error_message_property_used(self):
        """Rule accesses failure.error_message, not failure.err directly."""
        failure = _make_failure(self._REAL_ERROR)
        assert failure.error_message == self._REAL_ERROR
        assert no_devices_available.matches(failure) is True


# ── assertion_failure ──────────────────────────────────────────────────────────

class TestAssertionFailureRule:

    def test_matches_assertion_error(self):
        failure = _make_failure("AssertionError: expected 'foo' to equal 'bar'")
        assert assertion_failure.matches(failure) is True

    def test_does_not_match_device_error(self):
        failure = _make_failure("No more devices available for this execution.")
        assert assertion_failure.matches(failure) is False

    def test_explain_returns_logic_bug(self):
        failure = _make_failure("AssertionError: boom")
        result = assertion_failure.explain(failure)
        assert result["category"] == "TEST_ASSERTION"
        assert result["matchedRule"] == "common.assertion_failure"


# ── required_assertion_failed ──────────────────────────────────────────────────

def _make_required_failure(
    reason: dict | None = None,
    stack: str | None = None,
    message: str = "",
) -> FailureRecord:
    return FailureRecord(
        testCaseRunId="tcr-required",
        fullTitle="CPE :: AVAD :: IFA :: some IFA test",
        platform="STB",
        runInfo={"platformType": "CPE"},
        err={"message": message, "stack": stack, "response": None, "reason": reason},
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


_IFA_STACK = (
    "Error: IFA opt-in modal is shown on screen not expected\n"
    "    at setReason (/usr/src/app/config/helpers/elasticHelper.js:437:19)\n"
    "    at verifyIFAOptInModelIsNotOnAppsMainMenuScreen (...AdsOptIn.js:206:16)\n"
    "    at async Context.<anonymous> (...[XHZN4SI-64433]....js:57:9)"
)

_REASON_OBJ = {
    "required": {
        "status": "failed",
        "reason": "Title is not found in the parsed UI: {}",
    },
    "optional": {
        "subStatus": "failed",
        "detailedReason": "IFA opt-in modal is shown on screen not expected",
    },
}


class TestRequiredAssertionFailedRule:
    # Format 1: structured reason object with required.status == "failed"
    def test_format1_required_status_failed(self):
        f = _make_required_failure(reason=_REASON_OBJ)
        assert required_assertion_failed.matches(f) is True

    def test_format1_required_status_failed_no_stack(self):
        f = _make_required_failure(reason=_REASON_OBJ, stack=None)
        assert required_assertion_failed.matches(f) is True

    # Format 2: setReason in stack (mochawesome / InspectorWeb path)
    def test_format2_setreason_in_stack(self):
        f = _make_required_failure(stack=_IFA_STACK)
        assert required_assertion_failed.matches(f) is True

    def test_format2_setreason_in_stack_no_reason(self):
        f = _make_required_failure(reason=None, stack=_IFA_STACK)
        assert required_assertion_failed.matches(f) is True

    # Combined: full error as seen in the XHZN4SI-64433 IFA failure
    def test_combined_ifa_failure_matches(self):
        f = _make_required_failure(
            reason=_REASON_OBJ,
            stack=_IFA_STACK,
            message="Title is not found in the parsed UI: {}",
        )
        assert required_assertion_failed.matches(f) is True

    # Optional-only: required passes but optional.subStatus == "failed"
    def test_optional_substatus_failed(self):
        reason = {
            "required": {"status": "passed"},
            "optional": {"subStatus": "failed", "detailedReason": "IFA opt-in modal is shown on screen not expected"},
        }
        f = _make_required_failure(reason=reason, stack=_IFA_STACK)
        assert required_assertion_failed.matches(f) is True

    # No match cases
    def test_no_match_empty_err(self):
        f = _make_failure("Something unrelated with no setReason")
        assert required_assertion_failed.matches(f) is False

    def test_no_match_required_status_passed(self):
        reason = {"required": {"status": "passed"}, "optional": {"subStatus": "passed"}}
        f = _make_required_failure(reason=reason, stack=None)
        assert required_assertion_failed.matches(f) is False

    def test_no_match_no_setreason_in_stack(self):
        f = _make_required_failure(reason=None, stack="Error: timeout\n    at someOtherFunction:42:5")
        assert required_assertion_failed.matches(f) is False

    def test_explain_returns_playout_error(self):
        f = _make_required_failure(reason=_REASON_OBJ, stack=_IFA_STACK)
        result = required_assertion_failed.explain(f)
        assert result["category"] == "PLAYOUT_ERROR"
        assert result["confidence"] == 0.75
        assert result["matchedRule"] == "common.required_assertion_failed"
        assert "Title is not found" in result["explanation"]

    def test_explain_fallback_when_no_reason(self):
        f = _make_required_failure(reason=None, stack=_IFA_STACK, message="fallback message")
        result = required_assertion_failed.explain(f)
        assert "fallback message" in result["explanation"]


# ── rmq_rpc_timeout ────────────────────────────────────────────────────────────

# Exact error string captured from live CPE test failures
_RMQ_DIRECT_MSG = (
    "Error: RMQ RPC error [Error: Rabbitmq: rpc time out : exchange [inspectormanager],"
    " publishKey [executeCmd.lab] timeOutInMs [120000]], bottom stack: "
    "[Error: Rabbitmq: rpc time out : exchange [inspectormanager],"
    " publishKey [executeCmd.lab] timeOutInMs [120000]"
    " at Timeout.<anonymous> (/usr/src/app/node_modules/inspectorutils/dist/rabbitmq/createInstance.js:243:24)"
    " at listOnTimeout (node:internal/timers:594:17)"
    " at process.processTimers (node:internal/timers:529:7)]"
)

_RMQ_BOTTOM_STACK = (
    "Error: Rabbitmq: rpc time out : exchange [inspectormanager],"
    " publishKey [executeCmd.lab] timeOutInMs [120000]\n"
    "    at Timeout.<anonymous> (/usr/src/app/node_modules/inspectorutils/dist/rabbitmq/createInstance.js:243:24)\n"
    "    at listOnTimeout (node:internal/timers:594:17)\n"
    "    at process.processTimers (node:internal/timers:529:7)"
)


def _make_rmq(
    message: str = "",
    stack: str | None = None,
    reason: dict | None = None,
) -> FailureRecord:
    return FailureRecord(
        testCaseRunId="tcr-rmq",
        fullTitle="CPE :: some test that triggered RMQ timeout",
        platform="STB",
        runInfo={"platformType": "CPE"},
        err={"message": message, "stack": stack, "response": None, "reason": reason},
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


class TestRmqRpcTimeoutRule:
    # Format A: direct error in err.message (most common — no setReason wrapper)
    def test_direct_message_matches(self):
        f = _make_rmq(message=_RMQ_DIRECT_MSG)
        assert rmq_rpc_timeout.matches(f) is True

    def test_direct_rmq_rpc_error_prefix(self):
        f = _make_rmq(message="RMQ RPC error [Error: Rabbitmq: rpc time out : exchange [x]]")
        assert rmq_rpc_timeout.matches(f) is True

    def test_direct_rabbitmq_lowercase(self):
        f = _make_rmq(message="rabbitmq: rpc time out")
        assert rmq_rpc_timeout.matches(f) is True

    # Format B: RMQ error only in stack / estack (mochawesome bottom-stack path)
    def test_stack_contains_rpc_timeout(self):
        f = _make_rmq(stack=_RMQ_BOTTOM_STACK)
        assert rmq_rpc_timeout.matches(f) is True

    def test_stack_multiline_rabbitmq_dotall(self):
        multiline = "Error: rabbitmq\n    RPC call\n    time out at node:timers"
        f = _make_rmq(stack=multiline)
        assert rmq_rpc_timeout.matches(f) is True

    # Format C: RMQ error stored in reason.required.reason (setReason-wrapped path)
    def test_reason_required_reason_matches(self):
        reason = {
            "required": {
                "status": "failed",
                "reason": _RMQ_DIRECT_MSG,
            }
        }
        f = _make_rmq(message="Some unrelated assertion text", reason=reason)
        assert rmq_rpc_timeout.matches(f) is True

    # Format D: RMQ error stored in reason.optional.detailedReason
    def test_reason_optional_detailed_reason_matches(self):
        reason = {
            "required": {"status": "passed"},
            "optional": {
                "subStatus": "failed",
                "detailedReason": "Rabbitmq: rpc time out : exchange [inspectormanager]",
            },
        }
        f = _make_rmq(message="Some unrelated assertion text", reason=reason)
        assert rmq_rpc_timeout.matches(f) is True

    # No-match cases
    def test_no_match_unrelated_error(self):
        f = _make_rmq(message="AssertionError: expected true to equal false")
        assert rmq_rpc_timeout.matches(f) is False

    def test_no_match_empty_err(self):
        f = _make_rmq()
        assert rmq_rpc_timeout.matches(f) is False

    def test_no_match_timeout_without_rabbitmq(self):
        f = _make_rmq(message="Request timed out after 30000ms")
        assert rmq_rpc_timeout.matches(f) is False

    def test_explain_returns_orchestration(self):
        f = _make_rmq(message=_RMQ_DIRECT_MSG)
        result = rmq_rpc_timeout.explain(f)
        assert result["category"] == "ORCHESTRATION"
        assert result["confidence"] == 0.90
        assert result["matchedRule"] == "common.rmq_rpc_timeout"

    # Format E: RMQ error only in contextText (inspector context errors/reasons)
    # — occurs when err.message is a generic wrapper like "See report and log files..."
    def test_context_text_rmq_matches(self):
        f = FailureRecord(
            testCaseRunId="tcr-ctx",
            fullTitle="CPE :: some test",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Error: See report and log files for a detailed flow. Last known screen: {}",
                "stack": None,
                "response": None,
                "reason": None,
                "contextText": _RMQ_DIRECT_MSG,
            },
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert rmq_rpc_timeout.matches(f) is True

    def test_context_text_no_match_unrelated(self):
        f = FailureRecord(
            testCaseRunId="tcr-ctx2",
            fullTitle="CPE :: some test",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Error: See report and log files for a detailed flow. Last known screen: {}",
                "stack": None,
                "response": None,
                "reason": None,
                "contextText": "AssertionError: expected true to equal false",
            },
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert rmq_rpc_timeout.matches(f) is False


# ── inspector_session_terminated ───────────────────────────────────────────────

_SESSION_TERM_MSG = (
    "Error: See report and log files for a detailed flow. Last known screen: {}"
)


def _make_session_term(
    message: str = _SESSION_TERM_MSG,
    stack: str | None = None,
    context_text: str | None = None,
) -> FailureRecord:
    return FailureRecord(
        testCaseRunId="tcr-session-term",
        fullTitle="CPE :: some test",
        platform="STB",
        runInfo={"platformType": "CPE"},
        err={
            "message": message,
            "stack": stack,
            "response": None,
            "reason": None,
            "contextText": context_text,
        },
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )


class TestInspectorSessionTerminatedRule:

    def test_matches_exact_error_in_message(self):
        f = _make_session_term()
        assert inspector_session_terminated.matches(f) is True

    def test_case_insensitive(self):
        f = _make_session_term(message="error: see report and log files for a detailed flow. last known screen: {}")
        assert inspector_session_terminated.matches(f) is True

    def test_matches_in_stack(self):
        f = _make_session_term(
            message="",
            stack="Error: See report and log files for a detailed flow. Last known screen: {}\n    at Context.<anonymous>",
        )
        assert inspector_session_terminated.matches(f) is True

    def test_matches_in_context_text(self):
        f = _make_session_term(
            message="Some other message",
            context_text="Error: See report and log files for a detailed flow. Last known screen: {}",
        )
        assert inspector_session_terminated.matches(f) is True

    def test_does_not_match_unrelated_error(self):
        f = _make_session_term(message="AssertionError: expected true to equal false")
        assert inspector_session_terminated.matches(f) is False

    def test_does_not_match_partial_phrase(self):
        f = _make_session_term(message="See report and log files for a detailed flow.")
        assert inspector_session_terminated.matches(f) is False

    def test_does_not_match_empty(self):
        f = _make_session_term(message="")
        assert inspector_session_terminated.matches(f) is False

    def test_explain_returns_orchestration(self):
        f = _make_session_term()
        result = inspector_session_terminated.explain(f)
        assert result["category"] == "ORCHESTRATION"
        assert result["confidence"] == 0.70
        assert result["matchedRule"] == "common.inspector_session_terminated"
        assert "terminated" in result["explanation"].lower() or "session" in result["explanation"].lower()


# ── return_to_live_tv_failed ───────────────────────────────────────────────────

class TestReturnToLiveTvFailedRule:

    def test_matches_exact_error(self):
        f = _make_failure("returnToLiveTV max attempts were reached")
        assert return_to_live_tv_failed.matches(f) is True

    def test_case_insensitive(self):
        f = _make_failure("returntoliveTV MAX ATTEMPTS WERE REACHED")
        assert return_to_live_tv_failed.matches(f) is True

    def test_matches_in_context_text(self):
        f = FailureRecord(
            testCaseRunId="tcr-rltv",
            fullTitle="CPE :: live TV test",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Error: See report and log files for a detailed flow. Last known screen: {}",
                "stack": None,
                "response": None,
                "reason": None,
                "contextText": "returnToLiveTV max attempts were reached\nreturnToLiveTV max attempts were reached",
            },
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert return_to_live_tv_failed.matches(f) is True

    def test_does_not_match_unrelated(self):
        f = _make_failure("AssertionError: expected true to equal false")
        assert return_to_live_tv_failed.matches(f) is False

    def test_does_not_match_empty(self):
        f = _make_failure("")
        assert return_to_live_tv_failed.matches(f) is False

    def test_explain_returns_environment(self):
        f = _make_failure("returnToLiveTV max attempts were reached")
        result = return_to_live_tv_failed.explain(f)
        assert result["category"] == "ENVIRONMENT"
        assert result["confidence"] == 0.85
        assert result["matchedRule"] == "common.return_to_live_tv_failed"
        assert "returnToLiveTV" in result["explanation"]


# ── element_not_found ──────────────────────────────────────────────────────────

# Real captured error string (2026-08-30)
_ELEMENT_NOT_FOUND_MSG = (
    'Button "DIC_DETAIL_EPISODE_PICKER_BTN" not found via any strategy. '
    'sectionNavigation raw order: [{"visible":true,"isHighlighted":false,'
    '"id":"viewport-dp-sectionNavigation-actionContainer","isSelected":false}]'
)


class TestElementNotFoundRule:

    def test_matches_real_captured_error(self):
        f = _make_failure(_ELEMENT_NOT_FOUND_MSG)
        assert element_not_found.matches(f) is True

    def test_matches_generic_element_type(self):
        f = _make_failure('Element "SOME_COMPONENT_ID" not found via any strategy.')
        assert element_not_found.matches(f) is True

    def test_case_insensitive(self):
        f = _make_failure('button "MY_BTN" NOT FOUND VIA ANY STRATEGY.')
        assert element_not_found.matches(f) is True

    def test_matches_in_stack(self):
        f = FailureRecord(
            testCaseRunId="tcr-enf",
            fullTitle="CPE :: some test",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Error: See report and log files for a detailed flow. Last known screen: {}",
                "stack": 'Error: Button "MY_BTN" not found via any strategy.\n    at Context.<anonymous>',
                "response": None,
                "reason": None,
                "contextText": None,
            },
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert element_not_found.matches(f) is True

    def test_matches_in_context_text(self):
        f = FailureRecord(
            testCaseRunId="tcr-enf-ctx",
            fullTitle="CPE :: some test",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Error: See report and log files for a detailed flow. Last known screen: {}",
                "stack": None,
                "response": None,
                "reason": None,
                "contextText": 'Button "PLAY_BTN" not found via any strategy.',
            },
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert element_not_found.matches(f) is True

    def test_does_not_match_unrelated_error(self):
        f = _make_failure("AssertionError: expected true to equal false")
        assert element_not_found.matches(f) is False

    def test_does_not_match_empty(self):
        f = _make_failure("")
        assert element_not_found.matches(f) is False

    def test_does_not_match_partial_phrase(self):
        f = _make_failure('Button "MY_BTN" not found')
        assert element_not_found.matches(f) is False

    def test_explain_extracts_element_type_and_id(self):
        f = _make_failure(_ELEMENT_NOT_FOUND_MSG)
        result = element_not_found.explain(f)
        assert result["category"] == "AUTOMATION_SCRIPT"
        assert result["confidence"] == 0.80
        assert result["matchedRule"] == "common.element_not_found"
        assert "DIC_DETAIL_EPISODE_PICKER_BTN" in result["explanation"]
        assert "Button" in result["explanation"]

    def test_explain_fallback_when_no_match_detail(self):
        # explain() is defensive — should not crash if called without a match
        f = _make_failure("")
        result = element_not_found.explain(f)
        assert result["category"] == "AUTOMATION_SCRIPT"
        assert "UI element" in result["explanation"]
