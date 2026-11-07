# Author: Kishore Kumar
"""Tests for the /api/v1/rca/* router endpoints."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.models import FailureRecord, TestExecutionRecord

# ── Settings override ─────────────────────────────────────────────────────────

def _override_settings():
    from app.core.config import Settings
    return Settings(
        ODH_URL="http://odh-mock",
        JIRA_INJECTOR_URL="http://jira-mock",
        RABBITMQ_URL="amqp://guest:guest@localhost/",
        RCA_JIRA_COMMENT_ENABLED=False,
    )


app.dependency_overrides[get_settings] = _override_settings

# ── Auth helpers ──────────────────────────────────────────────────────────────

BASE = "/api/v1/rca"

# Fake payload returned by the mocked JWT decode
_MOCK_TOKEN = {
    "sub": "test@example.com",
    "type": "access",
    "jti": "test-jti",
    "exp": 9_999_999_999,
    "user": {"email": "test@example.com", "role": "user"},
}

# Access-token cookie used in every request that needs auth bypassed
_AUTH = {"Cookie": "access_token=fake-test-token"}


@contextmanager
def _bypass_auth():
    """Patch decode_token and the blocklist check so auth always succeeds.

    Tests that verify auth behaviour (401 cases) must NOT use this context manager.
    Tests that verify business logic MUST use it AND pass _AUTH in request headers.
    """
    with (
        patch("app.auth.dependencies.decode_token", return_value=_MOCK_TOKEN),
        patch("app.auth.dependencies._is_revoked", new_callable=AsyncMock, return_value=False),
    ):
        yield


# ── Fixture helpers ───────────────────────────────────────────────────────────

def _make_failure(
    run_id: str = "run-abc",
    message: str = "XAP call failed: timeout",
    platform: str = "STB",
) -> FailureRecord:
    return FailureRecord(
        testCaseRunId=run_id,
        fullTitle="Test :: some suite :: some case",
        platform=platform,
        runInfo={"boxType": "TV"},
        err={"message": message, "stack": None, "response": None},
        timestamp=datetime.now(tz=timezone.utc),
    )


def _make_exec_record(tcr_id: str, status: str, platform: str = "STB") -> TestExecutionRecord:
    return TestExecutionRecord(
        testCaseRunId=tcr_id,
        fullTitle=f"Suite :: {tcr_id}",
        status=status,
        platform=platform,
        runInfo={"platformType": platform},
        timestamp=datetime.now(tz=timezone.utc),
        err={"message": "boom", "stack": None, "response": None} if status == "failed" else None,
    )


# ── POST /rca/analyze ─────────────────────────────────────────────────────────

class TestAnalyzeEndpoint:

    def test_missing_auth_returns_401(self):
        with TestClient(app) as client:
            r = client.post(f"{BASE}/analyze", json={"runUuid": "abc-123"})
        assert r.status_code == 401

    def test_wrong_token_returns_401(self):
        with TestClient(app) as client:
            r = client.post(
                f"{BASE}/analyze",
                json={"runUuid": "abc-123"},
                headers={"Authorization": "Bearer not-a-valid-jwt"},
            )
        assert r.status_code == 401

    def test_run_uuid_returns_200_with_verdicts(self):
        failures = [_make_failure()]
        with (
            _bypass_auth(),
            # analyze now delegates to _fetch_failures_for_run (InspectorWeb-backed)
            patch("app.routers.rca._fetch_failures_for_run", new_callable=AsyncMock) as mock_fetch,
            patch("app.routers.rca.known_issue_matcher.find_known_issue", new_callable=AsyncMock) as mock_jira,
            patch("app.routers.rca.elastic_sink.publish", new_callable=AsyncMock),
            patch("app.routers.rca.jira_comment_sink.comment", new_callable=AsyncMock),
        ):
            mock_fetch.return_value = (failures, None, False, None)
            mock_jira.return_value = None
            with TestClient(app) as client:
                r = client.post(
                    f"{BASE}/analyze",
                    json={"runUuid": "run-abc"},
                    headers=_AUTH,
                )

        assert r.status_code == 200
        body = r.json()
        assert body["jobId"] is None
        assert isinstance(body["verdicts"], list)
        assert len(body["verdicts"]) == 1
        assert body["verdicts"][0]["category"] == "ENVIRONMENT"
        mock_fetch.assert_called_once_with("run-abc", None)

    def test_since_minutes_returns_200_with_job_id(self):
        from app.models import ExecutionsPage
        empty_page = ExecutionsPage(data=[], page=1, pageSize=100, totalPage=0, total=0)
        with (
            _bypass_auth(),
            # background job now queries InspectorWeb executions list
            patch("app.routers.rca.inspectorweb_client.list_executions", new_callable=AsyncMock) as mock_list,
            patch("app.routers.rca.elastic_sink.publish", new_callable=AsyncMock),
        ):
            mock_list.return_value = empty_page
            with TestClient(app) as client:
                r = client.post(
                    f"{BASE}/analyze",
                    json={"sinceMinutes": 60},
                    headers=_AUTH,
                )

        assert r.status_code == 200
        body = r.json()
        assert body["jobId"] is not None
        assert body["verdicts"] is None

    def test_job_status_poll(self):
        from app.models import ExecutionsPage
        empty_page = ExecutionsPage(data=[], page=1, pageSize=100, totalPage=0, total=0)
        with (
            _bypass_auth(),
            patch("app.routers.rca.inspectorweb_client.list_executions", new_callable=AsyncMock) as mock_list,
            patch("app.routers.rca.elastic_sink.publish", new_callable=AsyncMock),
        ):
            mock_list.return_value = empty_page
            with TestClient(app) as client:
                r = client.post(
                    f"{BASE}/analyze",
                    json={"sinceMinutes": 30},
                    headers=_AUTH,
                )
                job_id = r.json()["jobId"]
                status_r = client.get(f"{BASE}/verdicts/{job_id}", headers=_AUTH)

        assert status_r.status_code == 200
        assert status_r.json()["status"] in ("PENDING", "RUNNING", "DONE", "FAILED")

    def test_unknown_job_id_returns_404(self):
        with _bypass_auth():
            with TestClient(app) as client:
                r = client.get(
                    f"{BASE}/verdicts/nonexistent-job-id-12345",
                    headers=_AUTH,
                )
        assert r.status_code == 404

    def test_invalid_request_body_returns_422(self):
        with _bypass_auth():
            with TestClient(app) as client:
                r = client.post(f"{BASE}/analyze", json={}, headers=_AUTH)
        assert r.status_code == 422


# ── GET /rca/reports/by-run/{run_uuid} ───────────────────────────────────────

def _make_execution_summary(
    uuid: str = "run-uuid-abc",
    passed: int = 3,
    failed: int = 2,
    skipped: int = 1,
    unknown: int = 0,
):
    """Build a minimal ExecutionSummary-compatible dict for router tests."""
    from app.models import ExecutionSummary
    return ExecutionSummary.model_validate({
        "uuid_rc": uuid,
        "name": "FT_Test_Run",
        "status": "DONE",
        "status_id": 9,
        "error": None,
        "inserted": "2026-08-28T10:20:00Z",
        "updated": "2026-08-28T10:22:00Z",
        "run_info": {
            "total": passed + failed + skipped + unknown,
            "PASSED": passed,
            "FAILED": failed,
            "SKIPPED": skipped,
            "UNKNOWN": unknown,
        },
        "counts": {"done": "1", "total": "1"},
        "config": {},
    })


class TestRunReportEndpoint:

    def test_returns_200_with_populated_run_report(self):
        summary = _make_execution_summary()
        with (
            _bypass_auth(),
            patch(
                "app.routers.rca.inspectorweb_client.get_execution_by_run_uuid",
                new_callable=AsyncMock,
                return_value=summary,
            ),
        ):
            with TestClient(app) as client:
                r = client.get(f"{BASE}/reports/by-run/run-uuid-abc", headers=_AUTH)

        assert r.status_code == 200
        body = r.json()
        assert body["runUuid"] == "run-uuid-abc"
        assert body["totalFetched"] == 6
        assert body["totals"]["passed"] == 3
        assert body["totals"]["failed"] == 2
        assert body["totals"]["skipped"] == 1
        assert body["totals"]["pending"] == 0
        # Summary tier — no records fetched
        assert body["records"] == []

    def test_returns_404_when_execution_not_found(self):
        with (
            _bypass_auth(),
            patch(
                "app.routers.rca.inspectorweb_client.get_execution_by_run_uuid",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            with TestClient(app) as client:
                r = client.get(
                    f"{BASE}/reports/by-run/nonexistent-run-uuid",
                    headers=_AUTH,
                )

        assert r.status_code == 404
        assert "nonexistent-run-uuid" in r.json()["detail"]

    def test_requires_auth(self):
        with TestClient(app) as client:
            r = client.get(f"{BASE}/reports/by-run/run-uuid-no-auth")
        assert r.status_code == 401

    def test_summary_tier_never_calls_target_or_report_endpoints(self):
        """Acceptance: summary path must not touch get_targets_for_run or get_all_reports_for_run."""
        summary = _make_execution_summary()
        with (
            _bypass_auth(),
            patch(
                "app.routers.rca.inspectorweb_client.get_execution_by_run_uuid",
                new_callable=AsyncMock,
                return_value=summary,
            ),
            patch(
                "app.routers.rca.inspectorweb_client.get_targets_for_run",
                new_callable=AsyncMock,
                side_effect=AssertionError("summary tier must not call get_targets_for_run"),
            ),
            patch(
                "app.routers.rca.inspectorweb_client.get_all_reports_for_run",
                new_callable=AsyncMock,
                side_effect=AssertionError("summary tier must not call get_all_reports_for_run"),
            ),
        ):
            with TestClient(app) as client:
                r = client.get(f"{BASE}/reports/by-run/run-uuid-abc", headers=_AUTH)

        assert r.status_code == 200

    def test_include_details_triggers_full_fetch(self):
        """?includeDetails=true must call get_all_reports_for_run."""
        summary = _make_execution_summary()
        with (
            _bypass_auth(),
            patch(
                "app.routers.rca.inspectorweb_client.get_execution_by_run_uuid",
                new_callable=AsyncMock,
                return_value=summary,
            ),
            patch(
                "app.routers.rca.inspectorweb_client.get_all_reports_for_run",
                new_callable=AsyncMock,
                return_value=[],
            ) as mock_full,
        ):
            with TestClient(app) as client:
                r = client.get(
                    f"{BASE}/reports/by-run/run-uuid-abc?includeDetails=true",
                    headers=_AUTH,
                )

        assert r.status_code == 200
        mock_full.assert_called_once_with("run-uuid-abc")
