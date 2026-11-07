"""
Author: Kishore Kumar
Tests for batch analysis from this app's runs: stored per-run results (services/run_analysis.py),
the auto-analysis watcher (services/run_watcher.py) and the batch job in routers/rca.py.
InspectorWeb and the RCA pipeline are always mocked.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.models import RegressionRun, RunAnalysis
from app.core.db import Base
from app.models import AnalyzeRequest, RcaVerdict
from app.routers import rca
from app.services import run_analysis, run_watcher
from app.services.run_analysis import clear_stale_claims  # the real one (conftest stubs it for app startup)

U1 = "11111111-1111-4111-8111-111111111111"
U2 = "22222222-2222-4222-8222-222222222222"
NOW = datetime(2026, 11, 1, 12, 0)


def _verdict(n: int = 1) -> RcaVerdict:
    return RcaVerdict(testCaseRunId=f"t{n}", platform="STB", category="UNKNOWN", confidence=0.5, explanation="x")


@pytest.fixture
async def factory(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'batch.db'}", poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def pipeline():
    """Mocked InspectorWeb fetch + RCA pipeline + Elasticsearch publish."""
    fetch = AsyncMock(return_value=(["f1", "f2"], "KM_run", False, None))
    run = AsyncMock(return_value=[_verdict(1), _verdict(2)])
    with (
        patch.object(rca, "_fetch_failures_for_run", fetch),
        patch.object(rca, "_run_pipeline", run),
        patch("app.sinks.elastic_sink.publish", new_callable=AsyncMock) as publish,
    ):
        yield fetch, run, publish


async def _rows(factory) -> list[RunAnalysis]:
    async with factory() as db:
        return list((await db.execute(select(RunAnalysis))).scalars().all())


# ── Request ──────────────────────────────────────────────────────────────────

def test_run_uuids_selector():
    req = AnalyzeRequest(runUuids=[U1.upper(), U1, f" {U2} "])
    assert req.runUuids == [U1, U2]
    with pytest.raises(ValidationError):
        AnalyzeRequest(runUuids=[])
    with pytest.raises(ValidationError):
        AnalyzeRequest(runUuids=["not-a-uuid"])


# ── Stored results ───────────────────────────────────────────────────────────

async def test_analyze_once_then_reuse(factory, pipeline):
    fetch, _, publish = pipeline
    first = await run_analysis.analyze_run(U1, source="batch", session_factory=factory)
    assert len(first.verdicts) == 2 and not first.reused and first.execution_name == "KM_run"
    publish.assert_awaited_once()
    again = await run_analysis.analyze_run(U1, source="batch", session_factory=factory)
    assert again.reused and [v.testCaseRunId for v in again.verdicts] == ["t1", "t2"]
    assert fetch.await_count == 1 and publish.await_count == 1  # nothing fetched or published twice
    row = (await _rows(factory))[0]
    assert row.status == "DONE" and row.verdict_count == 2 and row.source == "batch"


async def test_aborted_is_stored_but_running_is_not(factory, pipeline):
    fetch, _, _ = pipeline
    fetch.return_value = ([], "KM_run", True, 'Execution "KM_run" was Aborted in InspectorWeb — Reason: no devices')
    res = await run_analysis.analyze_run(U1, source="auto", session_factory=factory)
    assert res.skipped.startswith('Execution "KM_run" was Aborted') and not res.still_running
    assert (await _rows(factory))[0].status == "SKIPPED"

    fetch.return_value = ([], "KM_run", True, 'Execution "KM_run" is still Running in InspectorWeb.')
    res = await run_analysis.analyze_run(U2, source="auto", session_factory=factory)
    assert res.still_running and [r.run_uuid for r in await _rows(factory)] == [U1]  # U2 left for later


async def test_network_error_is_recorded_and_retried_later(factory, pipeline):
    fetch, _, _ = pipeline
    fetch.side_effect = httpx.ConnectError("vpn down")
    with pytest.raises(httpx.ConnectError):
        await run_analysis.analyze_run(U1, source="auto", session_factory=factory)
    row = (await _rows(factory))[0]
    assert row.status == "FAILED" and row.attempts == 1
    async with factory() as db:
        settled = set((await db.execute(run_analysis.settled_run_uuids(datetime.utcnow()))).scalars().all())
        later = set((await db.execute(run_analysis.settled_run_uuids(datetime.utcnow() + timedelta(minutes=11)))).scalars().all())
    assert U1 in settled and U1 not in later  # retried once RETRY_AFTER has passed


async def test_remember_overwrites(factory):
    await run_analysis.remember(U1, status="SKIPPED", reason="aborted", session_factory=factory)
    await run_analysis.remember(U1, status="DONE", verdicts=[_verdict()], execution_name="R", session_factory=factory)
    rows = await _rows(factory)
    assert len(rows) == 1 and rows[0].status == "DONE" and rows[0].verdict_count == 1
    assert set(await run_analysis.stored([U1, U2], session_factory=factory)) == {U1}


# ── Watcher ──────────────────────────────────────────────────────────────────

async def _add_run(factory, run_uuid, *, phase="done", run_info=None, finished=True, name="KM_run"):
    async with factory() as db:
        db.add(RegressionRun(
            run_uuid=run_uuid, run_config_uuid="rc", name=name, triggered_by_email="kishor.m@infosys.com",
            inspector_username="kishor.m", inspectorweb_base_url="x", phase=phase,
            run_info_json=json.dumps(run_info) if run_info else None,
            created_at=NOW - timedelta(hours=1), finished_at=NOW - timedelta(minutes=5) if finished else None,
        ))
        await db.commit()


async def test_watcher_analyses_finished_runs(factory):
    await _add_run(factory, U1, run_info={"FAILED": 0, "PASSED": 3, "SKIPPED": 0, "UNKNOWN": 0, "total": 3})
    await _add_run(factory, U2, run_info={"FAILED": 2, "PASSED": 1, "SKIPPED": 0, "UNKNOWN": 0, "total": 3})
    with patch.object(run_analysis, "analyze_run", AsyncMock(return_value=run_analysis.RunResult(U2, verdicts=[_verdict()]))) as an:
        await run_watcher.analyze_finished(factory, NOW)
    an.assert_awaited_once()
    assert an.await_args.args[0] == U2  # the clean pass is stored without calling InspectorWeb
    assert {r.run_uuid: r.status for r in await _rows(factory)} == {U1: "DONE"}


async def test_watcher_follows_unfinished_runs(factory):
    await _add_run(factory, U1, phase="running", finished=False)
    status = {"status": "DONE", "phase": "done", "isTerminal": True, "runInfo": {"FAILED": 1}, "error": None}
    with patch("app.services.inspectorweb_regression.get_run_status", AsyncMock(return_value=status)):
        await run_watcher.follow(factory, NOW)
    async with factory() as db:
        run = (await db.execute(select(RegressionRun))).scalars().first()
    assert run.phase == "done" and run.finished_at is not None


# ── Batch job ────────────────────────────────────────────────────────────────

def _batch_patches(lines, fetch_side_effect, **extra):
    from contextlib import ExitStack
    stack = ExitStack()
    mocks = {
        "set_status": stack.enter_context(patch.object(rca.job_store, "set_status", AsyncMock())),
        "update": stack.enter_context(patch.object(rca, "_update_analysis_job", AsyncMock())),
        "pipeline": stack.enter_context(patch.object(rca, "_run_pipeline", AsyncMock(side_effect=lambda failures, sid: [_verdict(i) for i, _ in enumerate(failures)]))),
        "publish": stack.enter_context(patch.object(rca.elastic_sink, "publish", AsyncMock())),
        "save": stack.enter_context(patch.object(run_analysis, "save_verdicts", AsyncMock())),
    }
    stack.enter_context(patch.object(rca.job_store, "is_cancelled", return_value=False))
    stack.enter_context(patch.object(rca, "_run_names", AsyncMock(return_value={U1: "A", U2: "B"})))
    stack.enter_context(patch.object(run_analysis, "stored", AsyncMock(return_value=extra.get("stored", {}))))
    stack.enter_context(patch.object(run_analysis, "fetch_run", AsyncMock(side_effect=fetch_side_effect)))
    stack.enter_context(patch.object(rca.log_stream, "emit", side_effect=lambda sid, msg: lines.append(msg)))
    stack.enter_context(patch.object(rca, "_print_vpn_box"))
    return stack, mocks


async def test_batch_job_follows_single_run_phases():
    U3 = "33333333-3333-4333-8333-333333333333"
    fetched = {
        U1: run_analysis.Fetched(U1, reused=run_analysis.RunResult(U1, verdicts=[_verdict(9)], execution_name="A", reused=True)),
        U2: run_analysis.Fetched(U2, claimed=True, failures=["f1", "f2"], execution_name="B"),
        U3: run_analysis.Fetched(U3, claimed=True, execution_name="C", skipped="was Aborted"),
    }
    lines: list[str] = []
    row = RunAnalysis(run_uuid=U1, status="DONE", execution_name="A", verdict_count=1, verdicts_json=json.dumps([_verdict(9).model_dump()]))
    stack, m = _batch_patches(lines, lambda u, **_: fetched[u], stored={U1: row})
    with stack:
        await rca._batch_runs_job("job-1", AnalyzeRequest(runUuids=[U1, U2, U3]))
    assert m["set_status"].await_args_list[-1].args[:2] == ("job-1", "DONE")
    verdicts = m["update"].await_args.kwargs["verdicts"]
    assert len(verdicts) == 3  # 1 reused + 2 new
    # Tagged with their run, in the batch's order — so results show run by run.
    assert [(v.runUuid, v.runName) for v in verdicts] == [(U1, "A"), (U2, "B"), (U2, "B")]
    m["publish"].assert_awaited_once()
    assert len(m["publish"].await_args.args[0]) == 2  # only the new verdicts are published
    m["save"].assert_awaited_once()
    text = "\n".join(lines)
    for wording in ("Starting analysis of 3 run(s) (batch)", "1 analysed before", "A (11111111): reusing 1 stored verdict(s)",
                    "B (22222222): 2 failure(s) to analyse", "C (33333333): skipped — was Aborted", "Extracted 2 failure(s) from 1 run(s)",
                    "Running rule engine on 2 failure(s)", "Rule engine done", "Publishing 2 verdict(s)",
                    "✓ Batch complete — 3 verdict(s) from 3 run(s) (1 reused, 1 skipped)"):
        assert wording in text, wording


async def test_batch_job_fails_when_inspectorweb_is_unreachable_for_all():
    lines: list[str] = []
    stack, m = _batch_patches(lines, httpx.ConnectError("down"))
    with stack:
        await rca._batch_runs_job("job-2", AnalyzeRequest(runUuids=[U1]))
    assert m["set_status"].await_args.args[:2] == ("job-2", "FAILED")
    assert "InspectorWeb was unreachable" in m["update"].await_args.kwargs["cancel_reason"]


def test_child_log_lines_carry_the_run_name():
    from app.services import log_stream
    log_stream.open_stream("sid-x")
    child = log_stream.child("sid-x", "FT_AVAD ›")
    log_stream.emit(child, "[12:00:01] Fetching execution summary from InspectorWeb...")
    log_stream.emit(child, "no timestamp")
    log_stream.drop_child(child)
    assert log_stream.get_buffer("sid-x") == ["[12:00:01] FT_AVAD › Fetching execution summary from InspectorWeb...", "FT_AVAD › no timestamp"]
    assert log_stream.child(None, "x") is None


# ── Earlier Single Run results and leftover claims ───────────────────────────

async def test_earlier_single_run_counts_as_analysed(factory):
    from app.auth.models import AnalysisJob
    async with factory() as db:
        db.add(AnalysisJob(uid="j1", user_email="k@infosys.com", mode="sync", run_uuid=U1, job_id="j1", status="DONE",
                           verdict_count=1, verdicts_json=json.dumps([_verdict(7).model_dump()]), execution_name="R1"))
        await db.commit()
    found = await run_analysis.stored([U1, U2], session_factory=factory)
    assert set(found) == {U1} and found[U1].verdict_count == 1
    assert [v.testCaseRunId for v in run_analysis.reuse(found[U1]).verdicts] == ["t7"]
    async with factory() as db:
        settled = set((await db.execute(run_analysis.settled_run_uuids(datetime.utcnow()))).scalars().all())
    assert U1 in settled  # auto-analysis won't redo it


async def test_leftover_claim_never_hides_a_result(factory, pipeline):
    async with factory() as db:  # claim left by a process that stopped mid-analysis
        db.add(RunAnalysis(run_uuid=U1, status="RUNNING", attempts=1, created_at=datetime.utcnow(), updated_at=datetime.utcnow()))
        await db.commit()
    fetched = await run_analysis.fetch_run(U1, source="batch", session_factory=factory)
    assert not fetched.claimed and fetched.failures
    await run_analysis.save_verdicts(fetched, [_verdict()], source="batch", session_factory=factory)
    assert (await _rows(factory))[0].status == "DONE"

    async with factory() as db:
        db.add(RunAnalysis(run_uuid=U2, status="RUNNING", attempts=1))
        await db.commit()
    assert await clear_stale_claims(session_factory=factory) == 1
    assert {r.run_uuid for r in await _rows(factory)} == {U1}


async def test_batch_fails_when_runs_needing_fetch_are_unreachable_even_with_reused_ones():
    row = RunAnalysis(run_uuid=U1, status="DONE", execution_name="A", verdict_count=1, verdicts_json=json.dumps([_verdict(9).model_dump()]))
    lines: list[str] = []
    stack, m = _batch_patches(lines, httpx.ConnectError("down"), stored={U1: row})
    with stack:
        await rca._batch_runs_job("job-3", AnalyzeRequest(runUuids=[U1, U2]))
    assert m["set_status"].await_args.args[:2] == ("job-3", "FAILED")
    assert "VPN NOT CONNECTED" in "\n".join(lines) and "Batch complete" not in "\n".join(lines)


async def test_finished_log_is_kept_for_a_late_reader():
    """A batch that only reuses verdicts can finish before the page's stream connects."""
    from app.services import log_stream
    log_stream.open_stream("sid-late", "k@infosys.com")
    log_stream.emit("sid-late", "[12:00:00] ✓ Batch complete — 19 verdict(s)")
    await log_stream.close_stream("sid-late")
    assert not log_stream.session_active("sid-late") and log_stream.session_closed("sid-late")
    assert log_stream.get_buffer("sid-late") == ["[12:00:00] ✓ Batch complete — 19 verdict(s)"]
    assert log_stream.get_owner("sid-late") == "k@infosys.com"
    log_stream.open_stream("sid-late")  # reusing the id starts fresh
    assert log_stream.get_buffer("sid-late") == [] and not log_stream.session_closed("sid-late")


async def test_reader_gets_every_line_once_even_if_analysis_finishes_first():
    """A reader that connected before a fast batch started used to get only __DONE__."""
    import asyncio
    from app.services import log_stream

    async def reader(sid):
        while not (log_stream.session_active(sid) or log_stream.session_closed(sid)):
            await asyncio.sleep(0.01)
        seen, out = 0, []
        while True:
            lines, seen = log_stream.lines_since(sid, seen)
            out += lines
            if not log_stream.session_active(sid):
                out += log_stream.lines_since(sid, seen)[0]
                return out
            await log_stream.wait_for_lines(sid, 1.0)

    task = asyncio.create_task(reader("sid-fast"))
    await asyncio.sleep(0.02)
    log_stream.open_stream("sid-fast")
    for i in range(5):
        log_stream.emit("sid-fast", f"line {i}")
    await log_stream.close_stream("sid-fast")
    assert await asyncio.wait_for(task, 2) == [f"line {i}" for i in range(5)]


def test_lines_since_skips_lines_that_left_the_buffer():
    from app.services import log_stream
    log_stream.open_stream("sid-long")
    for i in range(log_stream.LOG_BUFFER_SIZE + 3):
        log_stream.emit("sid-long", str(i))
    lines, total = log_stream.lines_since("sid-long", 0)
    assert total == log_stream.LOG_BUFFER_SIZE + 3 and lines[0] == "3" and len(lines) == log_stream.LOG_BUFFER_SIZE
    assert log_stream.lines_since("sid-long", total - 1) == ([str(total - 1)], total)


def test_shared_report_groups_batch_verdicts_by_run():
    from app.core.report_html import build_report_html
    v = lambda u, c: {"testCaseRunId": f"{u}-{c}", "platform": "STB", "category": c, "confidence": 0.5,  # noqa: E731
                      "explanation": "x", "runUuid": u, "runName": "FT_AVAD"}
    batch = build_report_html({"status": "DONE"}, [v(U1, "ENVIRONMENT"), v(U2, "UNKNOWN"), v(U2, "KNOWN_ISSUE")], "QA")
    assert batch.count('class="run-group"') == 2 and "Run 1 of 2" in batch and "11111111" in batch and "2 verdicts" in batch
    single = build_report_html({"status": "DONE"}, [v(U1, "ENVIRONMENT")], "QA")
    assert "run-group" not in single  # one run → the usual flat list
