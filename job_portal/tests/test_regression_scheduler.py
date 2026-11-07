"""
Author: Kishore Kumar
Tests for the Regression tab's own scheduler (services/regression_scheduler.py).
InspectorWeb is always mocked: execute returns run UUIDs, run status comes from ``_STATUS``.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.pool import NullPool

from app.auth.models import RegressionRun, RegressionSchedule
from app.core.db import Base
from app.services import regression_scheduler as sched

RC1, RC2 = "rc-1", "rc-2"
BRU = ZoneInfo("Europe/Brussels")
# Saturday 2026-10-31 01:30 UTC = 02:30 Brussels (CET+1 from 25 Oct).
SAT_0230 = datetime(2026, 10, 31, 1, 30)


@pytest.fixture
async def factory(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'sched.db'}", poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def lab():
    """Fake InspectorWeb: execute hands out run-1, run-2, …; ``lab.status[run]`` is its phase."""
    class Lab:
        status: dict[str, str] = {}
        counter = 0

        async def execute(self, rc_uuid, username):
            self.counter += 1
            run = f"run-{self.counter}"
            self.status[run] = "running"
            return run

        async def get_status(self, run_uuid):
            phase = self.status.get(run_uuid)
            return phase and {"status": phase.upper(), "phase": phase, "isTerminal": phase in ("done", "aborted", "failed"),
                              "runInfo": None, "error": None}

    fake = Lab()
    fake.status = {}
    with (
        patch.object(sched, "tz", return_value=BRU),
        patch("app.services.inspectorweb_regression.execute_run_config", side_effect=fake.execute) as ex,
        patch("app.services.inspectorweb_regression.get_run_status", side_effect=fake.get_status),
    ):
        fake.execute_mock = ex
        yield fake


async def _add(factory, **kw) -> int:
    defaults = dict(
        uuid="s-1", name="KM_nightly", owner_email="kishor.m@infosys.com", inspector_username="kishor.m",
        run_configs_json=json.dumps([{"uuid": RC1, "name": "A"}]), mode="parallel", type="cron", cron="30 2 * * *",
        enabled=True, status="idle", executions=0, day_executions=0,
    )
    defaults.update(kw)
    for key in ("when", "until"):
        if key in defaults:
            defaults[f"{key}_json"] = json.dumps(defaults.pop(key))
    async with factory() as db:
        s = RegressionSchedule(**defaults)
        db.add(s)
        await db.commit()
        return s.id


async def _get(factory, sid=None) -> RegressionSchedule:
    async with factory() as db:
        return (await db.execute(select(RegressionSchedule))).scalars().first() if sid is None else await db.get(RegressionSchedule, sid)


async def _runs(factory) -> list[RegressionRun]:
    async with factory() as db:
        return list((await db.execute(select(RegressionRun).order_by(RegressionRun.id))).scalars().all())


# ── Pure helpers ─────────────────────────────────────────────────────────────

def test_cron_times_use_local_timezone():
    with patch.object(sched, "tz", return_value=BRU):
        assert sched.next_cron_times("30 2 * * *", SAT_0230 - timedelta(minutes=1)) == [SAT_0230]
    assert sched.valid_cron("30 2,10,18 * * 1-5") and not sched.valid_cron("0 0 2 * * *") and not sched.valid_cron("nope")


def test_when_conditions():
    sat_night = datetime(2026, 10, 31, 23, 30, tzinfo=BRU)
    window = {"after": "2026-11-01T21:00:00.000Z", "before": "2026-11-01T05:00:00.000Z"}  # 22:00–06:00 Brussels
    with patch.object(sched, "tz", return_value=BRU):
        assert sched.when_allows(None, sat_night)
        assert sched.when_allows({"type": "or", "value": [{"type": "days", "value": ["Saturday"]}]}, sat_night)
        assert not sched.when_allows({"type": "or", "value": [{"type": "days", "value": ["Monday"]}]}, sat_night)
        assert sched.when_allows({"type": "or", "value": [{"type": "between", "value": window}]}, sat_night)  # overnight
        assert not sched.when_allows({"type": "or", "value": [{"type": "between", "value": window}]}, sat_night.replace(hour=12))
        both = {"type": "and", "value": [{"type": "days", "value": ["Saturday"]}, {"type": "executionsPerDay", "value": {"executions": 2}}]}
        assert sched.when_allows(both, sat_night, day_executions=1) and not sched.when_allows(both, sat_night, day_executions=2)


def test_until_reasons():
    s = RegressionSchedule(executions=3, last_phase="aborted",
                           until_json=json.dumps({"type": "or", "value": [{"type": "executions", "value": "3"}]}))
    assert sched.until_reason(s, SAT_0230) == "Reached 3 executions"
    s.until_json = json.dumps({"type": "and", "value": [{"type": "executions", "value": 5}, {"type": "status", "value": "aborted"}]})
    assert sched.until_reason(s, SAT_0230) is None
    s.until_json = json.dumps({"type": "or", "value": [{"type": "timestamp", "value": "2026-10-31T01:00:00.000Z"}]})
    assert sched.until_reason(s, SAT_0230) == "Stop date reached"


# ── Loop behaviour ───────────────────────────────────────────────────────────

async def test_cron_fires_follows_run_and_stops_after_n_executions(factory, lab):
    await _add(factory, until={"type": "or", "value": [{"type": "executions", "value": 1}]})
    await sched.tick(factory, SAT_0230 - timedelta(minutes=5))  # first tick only plans the next start
    s = await _get(factory)
    assert s.next_run_at == SAT_0230 and lab.counter == 0

    await sched.tick(factory, SAT_0230 + timedelta(seconds=10))
    s = await _get(factory)
    assert lab.counter == 1 and s.status == "running" and s.executions == 1
    assert s.active["runs"][0]["runUuid"] == "run-1" and s.next_run_at == SAT_0230 + timedelta(days=1)
    lab.execute_mock.assert_awaited_once_with(RC1, "kishor.m")
    assert (await _runs(factory))[0].schedule_uuid == "s-1"

    await sched.tick(factory, SAT_0230 + timedelta(minutes=1))  # still running → nothing new
    assert lab.counter == 1 and (await _get(factory)).active_json

    lab.status["run-1"] = "done"
    await sched.tick(factory, SAT_0230 + timedelta(minutes=2))
    s = await _get(factory)
    assert s.active_json is None and s.last_phase == "done"
    assert s.status == "stopped" and s.enabled is False and s.stop_reason == "Reached 1 execution"
    run = (await _runs(factory))[0]
    assert run.phase == "done" and run.finished_at is not None


async def test_missed_cron_start_is_skipped(factory, lab):
    await _add(factory, next_run_at=SAT_0230)
    await sched.tick(factory, SAT_0230 + timedelta(hours=3))  # backend was down at 02:30
    s = await _get(factory)
    assert lab.counter == 0 and s.next_run_at == SAT_0230 + timedelta(days=1)


async def test_only_when_blocks_a_start(factory, lab):
    await _add(factory, next_run_at=SAT_0230, when={"type": "or", "value": [{"type": "days", "value": ["Monday"]}]})
    await sched.tick(factory, SAT_0230)
    assert lab.counter == 0 and (await _get(factory)).next_run_at == SAT_0230 + timedelta(days=1)


async def test_sequential_starts_next_after_previous_finishes(factory, lab):
    configs = [{"uuid": RC1, "name": "A"}, {"uuid": RC2, "name": "B"}]
    await _add(factory, mode="sequential", run_configs_json=json.dumps(configs), next_run_at=SAT_0230)
    await sched.tick(factory, SAT_0230)
    s = await _get(factory)
    assert lab.counter == 1 and s.active["queue"] == [RC2]

    lab.status["run-1"] = "aborted"
    await sched.tick(factory, SAT_0230 + timedelta(minutes=1))
    s = await _get(factory)
    assert lab.counter == 2 and lab.execute_mock.await_args.args[0] == RC2 and s.active["queue"] == []

    lab.status["run-2"] = "done"
    await sched.tick(factory, SAT_0230 + timedelta(minutes=2))
    s = await _get(factory)
    assert s.active_json is None and s.last_phase == "aborted" and s.status == "idle" and s.enabled


async def test_continuous_waits_a_gap_between_executions(factory, lab):
    await _add(factory, type="continuous", cron=None)
    await sched.tick(factory, SAT_0230)
    assert lab.counter == 1
    lab.status["run-1"] = "done"
    await sched.tick(factory, SAT_0230 + timedelta(minutes=1))  # finishes
    await sched.tick(factory, SAT_0230 + timedelta(minutes=1, seconds=30))  # inside the gap
    assert lab.counter == 1
    await sched.tick(factory, SAT_0230 + timedelta(minutes=2, seconds=5))
    assert lab.counter == 2


async def test_once_stops_after_its_execution(factory, lab):
    await _add(factory, type="once", cron=None)
    await sched.tick(factory, SAT_0230)
    lab.status["run-1"] = "done"
    await sched.tick(factory, SAT_0230 + timedelta(minutes=1))
    s = await _get(factory)
    assert lab.counter == 1 and s.status == "stopped" and s.stop_reason == "Ran once" and not s.enabled


async def test_failed_start_finishes_execution_with_error(factory, lab):
    from app.services.inspectorweb_regression import InspectorWebRejected
    lab.execute_mock.side_effect = InspectorWebRejected(404, "gone")
    await _add(factory, next_run_at=SAT_0230)
    await sched.tick(factory, SAT_0230)
    s = await _get(factory)
    assert s.active["runs"][0]["phase"] == "failed" and "A: InspectorWeb returned 404" in s.last_error
    await sched.tick(factory, SAT_0230 + timedelta(seconds=30))
    s = await _get(factory)
    assert s.active_json is None and s.last_phase == "aborted" and s.enabled


async def test_disable_lets_running_runs_finish_but_drops_queue(factory, lab):
    configs = [{"uuid": RC1, "name": "A"}, {"uuid": RC2, "name": "B"}]
    sid = await _add(factory, mode="sequential", run_configs_json=json.dumps(configs), next_run_at=SAT_0230)
    await sched.tick(factory, SAT_0230)
    async with factory() as db:
        s = await db.get(RegressionSchedule, sid)
        sched.disable(s)
        await db.commit()
    lab.status["run-1"] = "done"
    await sched.tick(factory, SAT_0230 + timedelta(minutes=1))
    s = await _get(factory)
    assert lab.counter == 1 and s.active_json is None and s.status == "idle" and not s.enabled


async def test_only_one_process_claims_an_execution(factory, lab):
    sid = await _add(factory, next_run_at=SAT_0230)
    async with factory() as db1, factory() as db2:
        a = await db1.get(RegressionSchedule, sid)
        b = await db2.get(RegressionSchedule, sid)
        await sched.fire(db1, a, SAT_0230)
        with pytest.raises(StaleDataError):
            await sched.fire(db2, b, SAT_0230)
    assert lab.counter == 1


async def test_enable_after_stop_resets_count(factory, lab):
    sid = await _add(factory, status="stopped", enabled=False, executions=3, stop_reason="Reached 3 executions")
    async with factory() as db:
        s = await db.get(RegressionSchedule, sid)
        sched.enable(s, SAT_0230 - timedelta(minutes=1))
        await db.commit()
    s = await _get(factory)
    assert s.enabled and s.status == "idle" and s.executions == 0 and s.stop_reason is None and s.next_run_at == SAT_0230
    assert sched.to_dict(s, SAT_0230 - timedelta(minutes=1))["nextRuns"][0] == "2026-10-31T01:30:00Z"
