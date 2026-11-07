# Author: Kishore Kumar
# Regression: ISSUE-006 — /rca/analyze accepted zero/negative sinceMinutes and sinceDays
# Found by /qa on 2026-11-01
# Report: .gstack/qa-reports/run-20261101T031943Z/qa-report-rca-service-api-2026-11-01.md
"""Tests for AnalyzeRequest time-window bounds."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import AnalyzeRequest


@pytest.mark.parametrize("field", ["sinceMinutes", "sinceDays"])
@pytest.mark.parametrize("value", [0, -60])
def test_non_positive_window_rejected(field, value):
    with pytest.raises(ValidationError):
        AnalyzeRequest(**{field: value})


@pytest.mark.parametrize("field", ["sinceMinutes", "sinceDays"])
def test_positive_window_accepted(field):
    assert getattr(AnalyzeRequest(**{field: 1}), field) == 1
