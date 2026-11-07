# Author: Kishore Kumar
"""Tests for inspectorweb_client and ExecutionSummary.error_message."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import ExecutionSummary
from app.services import inspectorweb_client
from app.core.errors import InspectorWebReportNotFound


# ── Captured live fixture ─────────────────────────────────────────────────────

_LIVE_ROW = {
    "type": "RUNCONFIG",
    "uuid_rc": "14d4221d-13a7-42bb-8661-fdcbcc918936",
    "uuid_tc": None,
    "uuid_ta": None,
    "uuid_computed": "14d4221d-13a7-42bb-8661-fdcbcc918936",
    "name": "FT_Platform_Monitor_labsuperset",
    "status": "DONE",
    "status_id": 9,
    "error": None,
    "exitCode": None,
    "inserted": "2026-08-28T10:20:00.377Z",
    "updated": "2026-08-28T10:22:49.497Z",
    "timestamps": {},
    "run_info": {"total": 29, "FAILED": 11, "PASSED": 8, "SKIPPED": 10, "UNKNOWN": 0},
    "warning": "true",
    "bs_execution_url": None,
    "id": 67708914,
    "rescheduled": False,
    "config": {
        "scheduleUUID": "sched-uuid-1",
        "config": {
            "jira": False,
            "targets": ["target-a", "target-b"],
            "jiraData": {"jql": ["project = HZN4SI AND ..."], "xray": True},
            "labels": ["smoke"],
            "branch": "master",
            "username": "fduvivier",
            "projectKey": "HZN4SI",
            "runConfigUUID": "rc-uuid-1",
            "mochaHooks": {},
        },
    },
    "counts": {"initial": "0", "queued": "0", "running": "0", "aborted": "0", "done": "1", "total": "1"},
    "target": None,
}

_FULL_RESPONSE = {
    "data": [_LIVE_ROW],
    "meta": {"pageSize": 1, "page": 1, "totalPage": 1, "total": 1},
}

_EMPTY_RESPONSE = {
    "data": [],
    "meta": {"pageSize": 1, "page": 1, "totalPage": 0, "total": 0},
}


def _mock_http(json_response: dict) -> MagicMock:
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = json_response
    resp.headers = {"content-type": "application/json"}
    resp.status_code = 200
    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=resp)
    return mock_client


# ── get_execution_by_run_uuid ─────────────────────────────────────────────────

class TestGetExecutionByRunUuid:

    @pytest.mark.asyncio
    async def test_returns_populated_summary_for_known_uuid(self):
        with patch.object(inspectorweb_client, "http_client", _mock_http(_FULL_RESPONSE)):
            result = await inspectorweb_client.get_execution_by_run_uuid(
                "14d4221d-13a7-42bb-8661-fdcbcc918936"
            )

        assert result is not None
        assert result.uuid_rc == "14d4221d-13a7-42bb-8661-fdcbcc918936"
        assert result.name == "FT_Platform_Monitor_labsuperset"
        assert result.status == "DONE"
        assert result.run_info is not None
        assert result.run_info.FAILED == 11
        assert result.run_info.PASSED == 8
        assert result.run_info.SKIPPED == 10
        assert result.run_info.total == 29

    @pytest.mark.asyncio
    async def test_returns_none_when_data_is_empty(self):
        with patch.object(inspectorweb_client, "http_client", _mock_http(_EMPTY_RESPONSE)):
            result = await inspectorweb_client.get_execution_by_run_uuid("nonexistent-uuid")

        assert result is None

    @pytest.mark.asyncio
    async def test_lifts_config_fields(self):
        with patch.object(inspectorweb_client, "http_client", _mock_http(_FULL_RESPONSE)):
            result = await inspectorweb_client.get_execution_by_run_uuid(
                "14d4221d-13a7-42bb-8661-fdcbcc918936"
            )

        assert result is not None
        assert result.triggered_by == "fduvivier"
        assert result.project_key == "HZN4SI"
        assert result.branch == "master"
        assert result.targets == ["target-a", "target-b"]
        assert "project = HZN4SI AND ..." in result.jira_jql

    @pytest.mark.asyncio
    async def test_counts_coerced_from_strings(self):
        with patch.object(inspectorweb_client, "http_client", _mock_http(_FULL_RESPONSE)):
            result = await inspectorweb_client.get_execution_by_run_uuid(
                "14d4221d-13a7-42bb-8661-fdcbcc918936"
            )

        assert result is not None
        assert isinstance(result.counts.done, int)
        assert result.counts.done == 1
        assert result.counts.total == 1


# ── ExecutionSummary.error_message ────────────────────────────────────────────

class TestErrorMessage:

    def _make(self, error: str | None) -> ExecutionSummary:
        return ExecutionSummary.model_validate({**_LIVE_ROW, "error": error})

    def test_null_error_returns_none(self):
        s = self._make(None)
        assert s.error_message is None

    def test_true_string_returns_none(self):
        s = self._make("true")
        assert s.error_message is None

    def test_true_uppercase_returns_none(self):
        s = self._make("True")
        assert s.error_message is None

    def test_parallel_error_stack_trace_extracts_message(self):
        raw = (
            "{ message: 'RunParallelError: No more devices available for this execution. Detail: []',\n"
            "  stack: 'Error\\n    at throwIfAllDevicesOrTargetsUnusable "
            "(.../parallelTargetValidation.js:24:19)\\n...' }"
        )
        s = self._make(raw)
        msg = s.error_message
        assert msg is not None
        assert "No more devices available" in msg

    def test_json_serialized_error_extracts_message(self):
        import json
        raw = json.dumps({
            "message": "SomeError: device timed out",
            "stack": "Error\n  at ...",
        })
        s = self._make(raw)
        assert s.error_message == "SomeError: device timed out"

    def test_plain_error_string_returned_as_is(self):
        s = self._make("Something went wrong entirely")
        assert s.error_message == "Something went wrong entirely"

    def test_does_not_raise_on_garbage_input(self):
        s = self._make("{{{broken json{{")
        # Must not raise; may return raw string or None
        try:
            _ = s.error_message
        except Exception as exc:  # noqa: BLE001
            pytest.fail(f"error_message raised unexpectedly: {exc}")


# ── get_report JSON-then-HTML fallback ────────────────────────────────────────

class TestGetReportFallback:

    def _make_resp(self, status_code: int, content_type: str, body) -> MagicMock:
        resp = MagicMock()
        resp.status_code = status_code
        resp.headers = {"content-type": content_type}
        resp.json.return_value = body if isinstance(body, dict) else {}
        resp.text = body if isinstance(body, str) else ""
        resp.raise_for_status = MagicMock(
            side_effect=None if status_code < 400 else Exception(f"HTTP {status_code}")
        )
        return resp

    @pytest.mark.asyncio
    async def test_uses_json_when_available(self):
        json_resp = self._make_resp(200, "application/json", {"stats": {"passes": 5}})
        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=json_resp)

        with patch.object(inspectorweb_client, "http_client", mock_client):
            result = await inspectorweb_client.get_report("target-uuid-1")

        assert result == {"stats": {"passes": 5}}
        # Only one GET call — no HTML fallback
        assert mock_client.get.call_count == 1
        call_url = mock_client.get.call_args[0][0]
        assert call_url.endswith(".json")

    @pytest.mark.asyncio
    async def test_falls_back_to_html_when_json_returns_non_json(self):
        non_json_resp = self._make_resp(200, "text/html", "")
        html_body = (
            "<html><body><script>"
            "window.__REPORT_DATA__ = {\"stats\":{\"passes\":3}};"
            "</script></body></html>"
        )
        html_resp = self._make_resp(200, "text/html", html_body)
        html_resp.text = html_body

        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=[non_json_resp, html_resp])

        with patch.object(inspectorweb_client, "http_client", mock_client):
            result = await inspectorweb_client.get_report("target-uuid-2")

        assert result.get("stats", {}).get("passes") == 3
        assert mock_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_raises_report_not_found_when_both_fail(self):
        import httpx

        fail_resp = MagicMock()
        fail_resp.status_code = 404
        fail_resp.headers = {"content-type": "text/html"}
        fail_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=fail_resp
        )

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=fail_resp)

        with patch.object(inspectorweb_client, "http_client", mock_client):
            with pytest.raises(InspectorWebReportNotFound):
                await inspectorweb_client.get_report("no-such-target")


# ── get_targets_for_run ───────────────────────────────────────────────────────

def _targets_page(page: int, total_pages: int, uuids: list[str]) -> dict:
    rows = [{"uuid_ta": u, "name": f"target-{u}", "status": "DONE"} for u in uuids]
    return {
        "data": rows,
        "meta": {"page": page, "pageSize": 100, "totalPage": total_pages, "total": sum([len(uuids)])},
    }


class TestGetTargetsForRun:

    @pytest.mark.asyncio
    async def test_single_page_returns_all_targets(self):
        page1 = _targets_page(1, 1, ["uuid-1", "uuid-2", "uuid-3"])
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = page1
        resp.headers = {"content-type": "application/json"}
        resp.status_code = 200
        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=resp)

        with patch.object(inspectorweb_client, "http_client", mock_client):
            targets = await inspectorweb_client.get_targets_for_run("run-uuid")

        assert [t["targetUuid"] for t in targets] == ["uuid-1", "uuid-2", "uuid-3"]
        assert mock_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_two_pages_collects_all_targets(self):
        page1 = _targets_page(1, 2, [f"uuid-{i}" for i in range(1, 101)])
        page2 = _targets_page(2, 2, [f"uuid-{i}" for i in range(101, 121)])

        def _make_resp(body):
            r = MagicMock()
            r.raise_for_status = MagicMock()
            r.json.return_value = body
            r.headers = {"content-type": "application/json"}
            r.status_code = 200
            return r

        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=[_make_resp(page1), _make_resp(page2)])

        with patch.object(inspectorweb_client, "http_client", mock_client):
            targets = await inspectorweb_client.get_targets_for_run("run-uuid")

        assert len(targets) == 120
        assert targets[0]["targetUuid"] == "uuid-1"
        assert targets[119]["targetUuid"] == "uuid-120"
        assert mock_client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_empty_response_returns_empty_list(self):
        empty = {"data": [], "meta": {"page": 1, "pageSize": 100, "totalPage": 0, "total": 0}}
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = empty
        resp.headers = {"content-type": "application/json"}
        resp.status_code = 200
        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=resp)

        with patch.object(inspectorweb_client, "http_client", mock_client):
            targets = await inspectorweb_client.get_targets_for_run("run-uuid")

        assert targets == []
