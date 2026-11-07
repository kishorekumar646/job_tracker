# Author: Kishore Kumar
"""Tests for the rule engine's evaluate() function."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models import FailureRecord
from app.services import rule_engine


def _ts() -> datetime:
    return datetime.now(tz=timezone.utc)


class TestRuleEngineEvaluate:
    def test_stb_xap_rule_matches(self):
        f = FailureRecord(
            testCaseRunId="t1",
            fullTitle="STB test",
            platform="STB",
            runInfo={"boxType": "TV"},
            err={"message": "XAP call failed: device timeout", "stack": None, "response": None},
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None
        assert result["category"] == "ENVIRONMENT"
        assert result["matchedRule"] == "stb.xap_call_failed"

    def test_android_drm_rule_matches(self):
        f = FailureRecord(
            testCaseRunId="t2",
            fullTitle="Android DRM test",
            platform="PERSEUS_ANDROID",
            runInfo={},
            activeDevice={"platform": "android"},
            err={"message": "playout error", "stack": None, "response": {"errorCode": "1001"}},
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None
        assert result["category"] == "DRM_ERROR"

    def test_ios_playout_rule_matches(self):
        f = FailureRecord(
            testCaseRunId="t3",
            fullTitle="iOS playout test",
            platform="PERSEUS_IOS",
            runInfo={},
            activeDevice={"platform": "ios"},
            err={"message": "playout error", "stack": None, "response": {"errorCode": "2001"}},
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None
        assert result["category"] == "PLAYOUT_ERROR"

    def test_browserstack_plan_limit_matches(self):
        f = FailureRecord(
            testCaseRunId="t4",
            fullTitle="BS capacity test",
            platform="BROWSERSTACK",
            runInfo={"location": "BROWSERSTACK"},
            err={"message": "plan limit exceeded", "stack": None, "response": None},
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None
        assert result["category"] == "BROWSERSTACK_CAPACITY"

    def test_common_assertion_fallback(self):
        f = FailureRecord(
            testCaseRunId="t5",
            fullTitle="Generic test",
            platform="STB",
            runInfo={"boxType": "TV"},
            err={"message": "AssertionError: expected true", "stack": None, "response": None},
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None
        assert result["category"] == "TEST_ASSERTION"
        assert result["matchedRule"] == "common.assertion_failure"

    def test_no_matching_rule_returns_none(self):
        f = FailureRecord(
            testCaseRunId="t6",
            fullTitle="Unknown error test",
            platform="STB",
            runInfo={"boxType": "TV"},
            err={"message": "Something completely new and unrecognised", "stack": None, "response": None},
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is None

    def test_stb_required_assertion_failed_via_reason(self):
        """CPE/STB IFA opt-in test failure — reason.required.status == 'failed' path."""
        f = FailureRecord(
            testCaseRunId="xhzn4si-64433",
            fullTitle="[CPE][AVAD][IFA] IFA sharing with Apps is provided as a configurable option",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Title is not found in the parsed UI: {}",
                "stack": (
                    "Error: IFA opt-in modal is shown on screen not expected\n"
                    "    at setReason (/usr/src/app/config/helpers/elasticHelper.js:437:19)\n"
                    "    at verifyIFAOptInModelIsNotOnAppsMainMenuScreen (...AdsOptIn.js:206:16)"
                ),
                "response": None,
                "reason": {
                    "required": {
                        "status": "failed",
                        "reason": "Title is not found in the parsed UI: {}",
                    },
                    "optional": {
                        "subStatus": "failed",
                        "detailedReason": "IFA opt-in modal is shown on screen not expected",
                    },
                },
            },
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None, "required_assertion_failed should match this CPE/AVAD/IFA error"
        assert result["matchedRule"] == "common.required_assertion_failed"
        assert result["category"] == "PLAYOUT_ERROR"

    def test_stb_required_assertion_failed_via_stack_only(self):
        """CPE/STB failure where reason field is absent — caught via setReason in stack."""
        f = FailureRecord(
            testCaseRunId="xhzn4si-stack-only",
            fullTitle="[CPE][AVAD][IFA] IFA stack-only test",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "IFA opt-in modal is shown on screen not expected",
                "stack": (
                    "Error: IFA opt-in modal is shown on screen not expected\n"
                    "    at setReason (/usr/src/app/config/helpers/elasticHelper.js:437:19)\n"
                    "    at verifyIFAOptInModelIsNotOnAppsMainMenuScreen (...AdsOptIn.js:206:16)"
                ),
                "response": None,
                "reason": None,
            },
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None, "required_assertion_failed Format 2 (setReason in stack) should match"
        assert result["matchedRule"] == "common.required_assertion_failed"

    def test_rmq_via_context_text_matches(self):
        """RMQ error buried in inspector context (contextText); err.message is generic wrapper."""
        f = FailureRecord(
            testCaseRunId="tcr-rmq-ctx",
            fullTitle="CPE :: some test that triggered RMQ timeout",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Error: See report and log files for a detailed flow. Last known screen: {}",
                "stack": None,
                "response": None,
                "reason": None,
                "contextText": (
                    "Error: RMQ RPC error [Error: Rabbitmq: rpc time out : exchange [inspectormanager],"
                    " publishKey [executeCmd.lab] timeOutInMs [120000]]"
                ),
            },
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None, "rmq_rpc_timeout should match via contextText"
        assert result["matchedRule"] == "common.rmq_rpc_timeout"
        assert result["category"] == "ORCHESTRATION"

    def test_inspector_session_terminated_fallback(self):
        """'See report and log files' with no RMQ text → inspector_session_terminated rule."""
        f = FailureRecord(
            testCaseRunId="tcr-session-term",
            fullTitle="CPE :: some test",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Error: See report and log files for a detailed flow. Last known screen: {}",
                "stack": None,
                "response": None,
                "reason": None,
                "contextText": None,
            },
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None, "inspector_session_terminated should catch this fallback error"
        assert result["matchedRule"] == "common.inspector_session_terminated"
        assert result["category"] == "ORCHESTRATION"

    def test_stb_required_assertion_reason_from_inspector_ctx(self):
        """XHZN4SI-20219: mochawesome did not serialize err.reason; reason comes from inspector_ctx.

        In _fetch_failures_for_run, err["reason"] is populated by:
            err_obj.get("reason") or (inspector_ctx or {}).get("reason")
        This test simulates what FailureRecord looks like after that fallback fires.
        """
        _TAILORED_ADS_STACK = (
            "Error: Incorrect tailored ads icon is shown in the popup\n"
            "    at setReason (/usr/src/app/config/helpers/elasticHelper.js:437:19)\n"
            "    at fail (...checks.js:84:30)\n"
            "    at verifyUsedAdsOptInIcon (...checks.js:107:15)\n"
            "    at async Context.<anonymous> (...[XHZN4SI-20219]....js:60:9)"
        )
        _REASON = {
            "required": {"status": "failed"},
            "optional": {
                "subStatus": "failed",
                "detailedReason": "Incorrect tailored ads icon is shown in the popup",
            },
        }
        f = FailureRecord(
            testCaseRunId="xhzn4si-20219",
            fullTitle="[CPE][AVAD][Settings-UI] AVAD BE Tailored Ads setting can be found in settings",
            platform="STB",
            runInfo={"platformType": "CPE"},
            err={
                "message": "Incorrect tailored ads icon is shown in the popup",
                "stack": _TAILORED_ADS_STACK,
                "response": None,
                "reason": _REASON,  # as populated after the inspector_ctx fallback
            },
            timestamp=_ts(),
        )
        result = rule_engine.evaluate(f)
        assert result is not None, "required_assertion_failed should match XHZN4SI-20219 tailored ads failure"
        assert result["matchedRule"] == "common.required_assertion_failed"
        assert result["category"] == "PLAYOUT_ERROR"

