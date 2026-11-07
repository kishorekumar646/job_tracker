# Author: Kishore Kumar
"""Tests for es_client.fetch_run_records and verdict_aggregator.summarize_run."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import es_client
from app.services.verdict_aggregator import summarize_run
from app.models import TestExecutionRecord


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_source(
    tcr_id: str,
    status: str = "passed",
    ts: str = "2026-01-01T00:00:00Z",
) -> dict:
    src: dict = {
        "testCaseRunId": tcr_id,
        "fullTitle": f"Suite :: {tcr_id}",
        "status": status,
        "platform": "STB",
        "runInfo": {"platformType": "STB"},
        "timestamp": ts,
    }
    if status == "failed":
        src["err"] = {"message": "XAP call failed", "stack": None, "response": None}
    return src


def _make_hit(tcr_id: str, status: str = "passed", sort_ts: int = 0) -> dict:
    return {
        "_source": _make_source(tcr_id, status),
        "sort": [sort_ts, tcr_id],
    }


def _mock_response(hits: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"hits": {"hits": hits}}
    return resp


# ── fetch_run_records pagination ───────────────────────────────────────────────

class TestFetchRunRecordsPagination:

    @pytest.mark.asyncio
    async def test_two_pages_are_concatenated(self):
        page_size = 2
        page1_hits = [_make_hit("tcr-1", sort_ts=1000), _make_hit("tcr-2", sort_ts=2000)]
        page2_hits = [_make_hit("tcr-3", sort_ts=3000)]  # partial → last page

        mock_client = MagicMock()
        mock_client.post = AsyncMock(side_effect=[
            _mock_response(page1_hits),
            _mock_response(page2_hits),
        ])

        with patch.object(es_client, "http_client", mock_client):
            records = await es_client.fetch_run_records("run-uuid-1", page_size=page_size)

        assert len(records) == 3
        assert [r.testCaseRunId for r in records] == ["tcr-1", "tcr-2", "tcr-3"]
        assert mock_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_second_request_sends_search_after_from_page_one(self):
        page_size = 2
        page1_hits = [_make_hit("tcr-a", sort_ts=100), _make_hit("tcr-b", sort_ts=200)]
        page2_hits = [_make_hit("tcr-c", sort_ts=300)]

        mock_client = MagicMock()
        mock_client.post = AsyncMock(side_effect=[
            _mock_response(page1_hits),
            _mock_response(page2_hits),
        ])

        with patch.object(es_client, "http_client", mock_client):
            await es_client.fetch_run_records("run-uuid-2", page_size=page_size)

        # The second call's body must include search_after = last hit's sort from page 1
        second_call_body = mock_client.post.call_args_list[1].kwargs["json"]
        assert second_call_body["search_after"] == [200, "tcr-b"]

    @pytest.mark.asyncio
    async def test_single_page_makes_exactly_one_http_call(self):
        page_size = 10
        hits = [_make_hit(f"tcr-{i}", sort_ts=i) for i in range(5)]  # 5 < page_size

        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=_mock_response(hits))

        with patch.object(es_client, "http_client", mock_client):
            records = await es_client.fetch_run_records("run-uuid-3", page_size=page_size)

        assert mock_client.post.call_count == 1
        assert len(records) == 5

    @pytest.mark.asyncio
    async def test_empty_first_page_returns_empty_list(self):
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=_mock_response([]))

        with patch.object(es_client, "http_client", mock_client):
            records = await es_client.fetch_run_records("run-uuid-missing")

        assert records == []
        assert mock_client.post.call_count == 1

    @pytest.mark.asyncio
    async def test_no_err_filter_applied(self):
        """Passed records (no err field) must be included in results."""
        hits = [
            _make_hit("tcr-pass", status="passed"),
            _make_hit("tcr-fail", status="failed"),
            _make_hit("tcr-skip", status="skipped"),
        ]
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=_mock_response(hits))

        with patch.object(es_client, "http_client", mock_client):
            records = await es_client.fetch_run_records("run-uuid-4", page_size=10)

        statuses = [r.status for r in records]
        assert "passed" in statuses
        assert "failed" in statuses
        assert "skipped" in statuses
        # Crucially: the query body must NOT contain an exists filter on err
        posted_body = mock_client.post.call_args.kwargs["json"]
        must_clauses = posted_body["query"]["bool"]["must"]
        for clause in must_clauses:
            assert "exists" not in clause, "fetch_run_records must not filter on err existence"

    @pytest.mark.asyncio
    async def test_sort_has_tiebreaker_field(self):
        """Sort must include both @timestamp and testCaseRunId for stable pagination."""
        mock_client = MagicMock()
        mock_client.post = AsyncMock(return_value=_mock_response([]))

        with patch.object(es_client, "http_client", mock_client):
            await es_client.fetch_run_records("run-uuid-5")

        posted_body = mock_client.post.call_args.kwargs["json"]
        sort_fields = [list(s.keys())[0] for s in posted_body["sort"]]
        assert "@timestamp" in sort_fields
        assert "testCaseRunId" in sort_fields


# ── summarize_run ──────────────────────────────────────────────────────────────

class TestSummarizeRun:

    def _make_record(self, status: str) -> TestExecutionRecord:
        return TestExecutionRecord(
            testCaseRunId=f"tcr-{status}",
            fullTitle=f"Suite :: {status} case",
            status=status,
            platform="STB",
            runInfo={"platformType": "STB"},
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )

    def test_counts_all_known_statuses(self):
        records = [
            self._make_record("passed"),
            self._make_record("passed"),
            self._make_record("failed"),
            self._make_record("skipped"),
            self._make_record("pending"),
        ]
        totals = summarize_run(records)
        assert totals == {"passed": 2, "failed": 1, "skipped": 1, "pending": 1}

    def test_unknown_status_counted_as_pending(self):
        records = [self._make_record("flaky")]
        totals = summarize_run(records)
        assert totals["pending"] == 1

    def test_empty_list_returns_zeros(self):
        totals = summarize_run([])
        assert totals == {"passed": 0, "failed": 0, "skipped": 0, "pending": 0}

    def test_all_passed(self):
        records = [self._make_record("passed") for _ in range(10)]
        totals = summarize_run(records)
        assert totals["passed"] == 10
        assert totals["failed"] == 0
