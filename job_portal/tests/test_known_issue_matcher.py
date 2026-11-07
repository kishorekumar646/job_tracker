# Author: Kishore Kumar
"""Tests for known_issue_matcher.find_known_issue()."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models import FailureRecord
from app.services import known_issue_matcher


def _make_failure(jira_link: str | None = None, message: str = "Something went wrong") -> FailureRecord:
    return FailureRecord(
        testCaseRunId="ki-run-001",
        fullTitle="Known issue test",
        platform="PERSEUS_ANDROID",
        runInfo={},
        jiraLink=jira_link,
        err={"message": message, "stack": None, "response": None},
        timestamp=datetime.now(tz=timezone.utc),
    )


@pytest.mark.asyncio
async def test_direct_link_open_issue():
    """If jiraLink contains a ticket key and the issue is open, return that key."""
    failure = _make_failure(jira_link="https://jira.example.com/browse/BUG-123")
    open_issue = {"key": "BUG-123", "fields": {"status": {"name": "Open"}}}

    with patch("app.services.known_issue_matcher.jira_client.get_issue_by_id", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = open_issue
        result = await known_issue_matcher.find_known_issue(failure)

    assert result == "BUG-123"
    mock_get.assert_awaited_once_with("BUG-123")


@pytest.mark.asyncio
async def test_direct_link_closed_issue_falls_back_to_search():
    """If the directly-linked issue is closed, fall back to fingerprint search."""
    failure = _make_failure(jira_link="https://jira.example.com/browse/BUG-999")
    closed_issue = {"key": "BUG-999", "fields": {"status": {"name": "Closed"}}}
    search_issue = [{"key": "BUG-777"}]

    with (
        patch("app.services.known_issue_matcher.jira_client.get_issue_by_id", new_callable=AsyncMock) as mock_get,
        patch("app.services.known_issue_matcher.jira_client.search_jql", new_callable=AsyncMock) as mock_search,
    ):
        mock_get.return_value = closed_issue
        mock_search.return_value = search_issue
        result = await known_issue_matcher.find_known_issue(failure)

    assert result == "BUG-777"


@pytest.mark.asyncio
async def test_fingerprint_search_returns_first_match():
    """No jiraLink: should fingerprint-search and return the first result."""
    failure = _make_failure(message="DRM license expired for stream abc123")

    with patch("app.services.known_issue_matcher.jira_client.search_jql", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = [{"key": "DRM-42"}, {"key": "DRM-7"}]
        result = await known_issue_matcher.find_known_issue(failure)

    assert result == "DRM-42"


@pytest.mark.asyncio
async def test_fingerprint_search_no_match():
    """No jiraLink and Jira returns empty list → None."""
    failure = _make_failure(message="Totally unknown error")

    with patch("app.services.known_issue_matcher.jira_client.search_jql", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = []
        result = await known_issue_matcher.find_known_issue(failure)

    assert result is None


@pytest.mark.asyncio
async def test_jira_search_exception_returns_none():
    """If Jira search raises an exception, return None gracefully."""
    failure = _make_failure(message="Some error")

    with patch("app.services.known_issue_matcher.jira_client.search_jql", new_callable=AsyncMock) as mock_search:
        mock_search.side_effect = Exception("Jira unreachable")
        result = await known_issue_matcher.find_known_issue(failure)

    assert result is None

