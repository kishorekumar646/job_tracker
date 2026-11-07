# Author: Kishore Kumar
"""Tests for the Regression tab: InspectorWeb regression client, permissions, and /api/v1/regression."""
from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.models import RegressionRun, User
from app.auth.permissions import effective_permissions, has_permission, parse_permissions
from app.core.config import Settings, get_settings
from app.core.db import Base, get_db
from app.main import app
from app.services import inspectorweb_client
from app.services import inspectorweb_regression as iw

BASE = "/api/v1/regression"
LAB = "https://iw-lab.example"
RUN_UUID = "11111111-2222-3333-4444-555555555555"
RC_UUID = "725f8629-5e3f-48db-b1a4-72ab7d429f7d"

_RUN_CONFIG = {
    "uuid": RC_UUID,
    "name": "CPE_MONITOR_V32",
    "username": "nrani",
    "runconfig": {
        "branch": "master",
        "labels": ["X_Monitor"],
        "targets": [[{"type": "platform", "value": "DCX960"}]],
        "jiraData": {"jql": ["project in (XHZN4SI)"], "xray": True},
        "timeOut": 2700000,
    },
}


def _rc_row(status: str, error=None, run_info=None) -> dict:
    return {
        "type": "RUNCONFIG", "uuid_rc": RUN_UUID, "name": "CPE_MONITOR_V32",
        "status": status, "status_id": 9, "error": error,
        "inserted": "2026-11-01T10:00:00.000Z", "updated": "2026-11-01T10:05:00.000Z",
        "run_info": run_info, "counts": {"done": "1", "total": "1"},
        "config": {"config": {"username": "kishor.m", "branch": "master"}},
    }


def _resp(body, status: int = 200, content_type: str = "application/json") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.headers = {"content-type": content_type}
    if isinstance(body, str) and content_type != "application/json":
        resp.json.side_effect = ValueError("not json")
    else:
        resp.json.return_value = body
    resp.text = body if isinstance(body, str) else json.dumps(body)
    return resp


def _client(*responses) -> MagicMock:
    client = MagicMock()
    client.request = AsyncMock(side_effect=list(responses))
    return client


@pytest.fixture(autouse=True)
def _iw_settings():
    """Point every call at a fake lab URL and start each test with an empty cache."""
    settings = Settings(INSPECTORWEB_BASE_URL=LAB, INSPECTORWEB_USERNAME="rca-agent", LOCAL_TIMEZONE="UTC")
    with (
        patch("app.services.inspectorweb_client.get_settings", return_value=settings),
        patch("app.services.inspectorweb_regression.get_settings", return_value=settings),
    ):
        iw.invalidate()
        yield settings
        iw.invalidate()


# ── Status mapping ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,phase", [
    ("DONE", "done"), ("done", "done"), ("RUNNING", "running"), ("QUEUED", "queued"),
    ("INITIAL", "queued"), ("ABORTED", "aborted"), ("STOPPED", "aborted"),
    ("FAILED", "failed"), ("", "unknown"), (None, "unknown"), ("WEIRD", "unknown"),
])
def test_map_phase(raw, phase):
    assert iw.map_phase(raw) == phase


def test_regression_base_falls_back_and_overrides(_iw_settings):
    assert iw.regression_base() == LAB
    _iw_settings.INSPECTORWEB_REGRESSION_BASE_URL = "https://iw-staging.example/"
    assert iw.regression_base() == "https://iw-staging.example"
    assert iw.ui_url(f"executions/{RUN_UUID}") == f"https://iw-staging.example/inspectorweb/executions/{RUN_UUID}"


# ── Lookups ──────────────────────────────────────────────────────────────────

async def test_list_run_configs_filters_and_summarises():
    client = _client(_resp({"data": [_RUN_CONFIG], "meta": {"page": 1, "pageSize": 25, "totalPage": 1, "total": 1}}))
    with patch.object(inspectorweb_client, "http_client", client):
        result = await iw.list_run_configs("monitor", 1, 25)

    method, url = client.request.call_args.args
    kwargs = client.request.call_args.kwargs
    assert (method, url) == ("GET", f"{LAB}/inspectorweb/api/v2/run-configs")
    assert kwargs["params"]["name[0]"] == "monitor" and kwargs["params"]["logic"] == "iLike"
    assert kwargs["headers"]["Inspector-User"] == "rca-agent"
    rc = result["data"][0]
    assert rc["name"] == "CPE_MONITOR_V32" and rc["xray"] is True and rc["jql"] == ["project in (XHZN4SI)"]
    assert rc["inspectorwebUrl"].endswith(f"/inspectorweb/runconfigs/{RC_UUID}")
    assert result["total"] == 1


async def test_list_targets_maps_flattened_columns():
    row = {"name": "Labci_cloud_box", "type": "stb", "lab": "obolab_cloud_labci", "lockedForGroup": "FT",
           "owner": "nrani", "target_status.status": "IDLE", "target_status.uuid_rc": None,
           "target_data.platform": "DCX960", "cpe_id": "3C36E4-EOSSTB-778900080045"}
    client = _client(_resp({"data": [row], "meta": {"total": 1}}))
    with patch.object(inspectorweb_client, "http_client", client):
        result = await iw.list_targets("stb", None, 1, 25)

    params = client.request.call_args.kwargs["params"]
    assert params["type"] == "stb" and "name[0]" not in params
    assert result["data"][0] == {
        "name": "Labci_cloud_box", "cpeId": "3C36E4-EOSSTB-778900080045", "type": "stb", "lab": "obolab_cloud_labci", "platform": "DCX960",
        "lockedForGroup": "FT", "owner": "nrani", "status": "IDLE", "busyWithRun": None,
        "location": None, "deviceType": None,
    }


async def test_list_targets_by_cpe_id():
    client = _client(_resp({"data": [], "meta": {"total": 0}}), _resp({"data": [], "meta": {"total": 0}}))
    with patch.object(inspectorweb_client, "http_client", client):
        await iw.list_targets("stb", "778900080045", 1, 10, by="cpe_id")
        await iw.list_targets("stb", "Labci", 1, 10)
    first, second = (c.kwargs["params"] for c in client.request.call_args_list)
    assert first["cpe_id[0]"] == "778900080045" and "name[0]" not in first and first["logic"] == "iLike"
    assert second["name[0]"] == "Labci" and "cpe_id[0]" not in second


async def test_meta_is_cached():
    client = _client(
        _resp({"version": "v7.57.18"}), _resp({"environment": "LABS"}),
        _resp(["master", "dev"]), _resp([900000, 1800000]), _resp(["Regression", "Smoke"]),
    )
    with patch.object(inspectorweb_client, "http_client", client):
        first = await iw.get_meta()
        second = await iw.get_meta()

    assert first == second
    assert first["version"] == "v7.57.18" and first["branches"] == ["master", "dev"]
    assert first["labelOptions"] == ["Regression", "Smoke"]
    assert client.request.await_count == 5  # second call served from cache


async def test_test_cases_cached_per_branch():
    client = _client(_resp([{"basePath": "/test/a.js", "name": "a.js"}]), _resp([]))
    with patch.object(inspectorweb_client, "http_client", client):
        assert len(await iw.list_test_cases("master")) == 1
        assert len(await iw.list_test_cases("master")) == 1
        assert await iw.list_test_cases("dev") == []
    assert client.request.await_count == 2


async def test_unreachable_raises_unavailable():
    import httpx
    client = MagicMock()
    client.request = AsyncMock(side_effect=httpx.ConnectTimeout("timed out"))
    with patch.object(inspectorweb_client, "http_client", client):
        with pytest.raises(iw.InspectorWebUnavailable):
            await iw.list_run_configs(None, 1, 25)


# ── Trigger / stop payloads ──────────────────────────────────────────────────

async def test_execute_payload_and_string_response():
    client = _client(_resp(f'"{RUN_UUID}"', content_type="text/plain"))
    with patch.object(inspectorweb_client, "http_client", client):
        run_uuid = await iw.execute_run_config(RC_UUID, "kishor.m")

    method, url = client.request.call_args.args
    kwargs = client.request.call_args.kwargs
    assert (method, url) == ("POST", f"{LAB}/inspectorweb/api/v2/run-configs/execute")
    assert kwargs["json"] == {"uuid": RC_UUID, "username": "kishor.m"}
    assert kwargs["headers"]["Inspector-User"] == "kishor.m"
    assert run_uuid == RUN_UUID


@pytest.mark.parametrize("body", [RUN_UUID, {"uuid_rc": RUN_UUID}, {"data": {"uuid": RUN_UUID}}])
async def test_execute_response_shapes(body):
    with patch.object(inspectorweb_client, "http_client", _client(_resp(body))):
        assert await iw.execute_run_config(RC_UUID, "kishor.m") == RUN_UUID


async def test_execute_rejection_keeps_upstream_detail():
    detail = {"message": "Validation Failed", "details": {"uuid": {"message": "bad"}}}
    with patch.object(inspectorweb_client, "http_client", _client(_resp(detail, status=422))):
        with pytest.raises(iw.InspectorWebRejected) as info:
            await iw.execute_run_config(RC_UUID, "kishor.m")
    assert info.value.status == 422 and info.value.detail == detail


async def test_stop_payload():
    client = _client(_resp({}))
    with patch.object(inspectorweb_client, "http_client", client):
        await iw.stop_run(RUN_UUID, "kishor.m")

    method, url = client.request.call_args.args
    kwargs = client.request.call_args.kwargs
    assert (method, url) == ("PUT", f"{LAB}/inspectorweb/api/v2/executions/stop")
    assert kwargs["json"] == {"username": "kishor.m", "type": "RUNCONFIG", "uuid_rc": [RUN_UUID]}
    assert kwargs["headers"]["Inspector-User"] == "kishor.m"


# ── Run status ───────────────────────────────────────────────────────────────

async def test_run_status_joins_test_cases_and_targets():
    ri = {"total": 2, "FAILED": 1, "PASSED": 1, "SKIPPED": 0, "UNKNOWN": 0}
    tc_rows = [
        {"type": "TESTCASE", "uuid_tc": "tc-1", "name": "[XHZN4SI-36841]_Navigate-the-search-results",
         "status": "DONE", "run_info": {"total": 1, "FAILED": 1, "PASSED": 0, "SKIPPED": 0, "UNKNOWN": 0}},
        {"type": "TESTCASE", "uuid_tc": "tc-2", "name": "[XHZN4SI-19451]Opening-closing-DisneyPlus",
         "status": "DONE", "run_info": {"total": 1, "UNKNOWN": 1}},
        {"type": "TESTCASE", "uuid_tc": "tc-3", "name": "[XHZN4SI-24026]Opening-closing-Netflix",
         "status": "INITIAL", "run_info": None},
    ]
    ta_rows = [
        {"type": "TARGET", "uuid_tc": "tc-1", "uuid_ta": "ta-1", "name": "HArchive_021", "status": "DONE",
         "error": None, "run_info": {"total": 1, "FAILED": 1, "PASSED": 0, "SKIPPED": 0, "UNKNOWN": 0}},
        {"type": "TARGET", "uuid_tc": "tc-2", "uuid_ta": "ta-2", "name": "HArchive_021", "status": "DONE",
         "error": "true", "run_info": {"total": 1, "UNKNOWN": 1}},
    ]
    rc = _rc_row("RUNNING", run_info=ri)
    rc["counts"] = {"initial": "1", "running": "0", "done": "2", "total": "3"}
    client = _client(_resp({"data": [rc]}), _resp({"data": tc_rows}), _resp({"data": ta_rows}))
    with patch.object(inspectorweb_client, "http_client", client):
        status = await iw.get_run_status(RUN_UUID)
        again = await iw.get_run_status(RUN_UUID)

    assert status is again  # cached for STATUS_TTL
    assert client.request.await_count == 3
    assert status["progress"] == {"total": 3, "done": 2, "running": 0, "waiting": 1, "aborted": 0}
    types = [c.kwargs["params"]["type"] for c in client.request.call_args_list[1:]]
    assert sorted(types) == ["TARGET", "TESTCASE"]

    by_uuid = {tc["testCaseUuid"]: tc for tc in status["testCases"]}
    assert by_uuid["tc-1"]["outcome"] == "failed"
    assert by_uuid["tc-2"]["outcome"] == "no_result"   # InspectorWeb's UNKNOWN
    assert by_uuid["tc-3"]["outcome"] == "not_started" and by_uuid["tc-3"]["targets"] == []

    target = by_uuid["tc-1"]["targets"][0]
    assert target["testCaseName"] == "[XHZN4SI-36841]_Navigate-the-search-results"
    assert target["reportUrl"] == f"{LAB}/inspectorweb/api/results_report/ta-1.html"
    assert target["logUrl"] == f"{LAB}/inspectorweb/logging/ta-1.log"
    assert target["downloadUrl"] == f"{LAB}/inspectorweb/api/executions/report/ta-1"
    assert by_uuid["tc-2"]["targets"][0]["error"] is None  # literal "true" hidden


@pytest.mark.parametrize("phase,ri,expected", [
    ("queued", None, "not_started"),
    ("running", {"total": 1, "PASSED": 0, "FAILED": 0, "SKIPPED": 0, "UNKNOWN": 1}, "running"),
    ("done", {"total": 1, "PASSED": 1, "FAILED": 0, "SKIPPED": 0, "UNKNOWN": 0}, "passed"),
    ("done", {"total": 2, "PASSED": 1, "FAILED": 1, "SKIPPED": 0, "UNKNOWN": 0}, "failed"),
    ("done", {"total": 1, "PASSED": 0, "FAILED": 0, "SKIPPED": 1, "UNKNOWN": 0}, "skipped"),
    ("done", {"total": 1, "PASSED": 0, "FAILED": 0, "SKIPPED": 0, "UNKNOWN": 1}, "no_result"),
    ("done", None, "no_result"),
    ("aborted", None, "aborted"),
])
def test_outcome(phase, ri, expected):
    assert iw.outcome(phase, ri) == expected


async def test_run_status_running_is_not_terminal():
    client = _client(_resp({"data": [_rc_row("RUNNING")]}), _resp({"data": []}), _resp({"data": []}))
    with patch.object(inspectorweb_client, "http_client", client):
        status = await iw.get_run_status(RUN_UUID)
    assert status["phase"] == "running" and status["isTerminal"] is False and status["runInfo"] is None


async def test_run_status_abort_uses_target_reason():
    client = _client(_resp({"data": [_rc_row("ABORTED", error="true")]}), _resp({"data": []}), _resp({"data": []}))
    with (
        patch.object(inspectorweb_client, "http_client", client),
        patch.object(inspectorweb_client, "get_abort_reason_from_targets",
                     AsyncMock(return_value="CPE not available")) as reason,
    ):
        status = await iw.get_run_status(RUN_UUID)
    reason.assert_awaited_once_with(RUN_UUID)
    assert status["phase"] == "aborted" and status["error"] == "CPE not available"


async def test_run_status_abort_without_reason_hides_literal_true():
    client = _client(_resp({"data": [_rc_row("ABORTED", error="true")]}), _resp({"data": []}), _resp({"data": []}))
    with (
        patch.object(inspectorweb_client, "http_client", client),
        patch.object(inspectorweb_client, "get_abort_reason_from_targets", AsyncMock(return_value=None)),
    ):
        status = await iw.get_run_status(RUN_UUID)
    assert status["error"] is None


async def test_run_status_not_found():
    with patch.object(inspectorweb_client, "http_client", _client(_resp({"data": []}))):
        assert await iw.get_run_status(RUN_UUID) is None


# ── Report details ───────────────────────────────────────────────────────────

def _report(status: str = "failed") -> dict:
    """Trimmed copy of a real Inspector mochawesome report (run 912034c9…, 2026-11-01)."""
    info = {
        "featureTeam": "FT_APPS", "tags": ["DisneyPlus", "DisneyPlus"], "components": ["xap"],
        "jiraLink": "https://jira.lgi.io/browse/XHZN4SI-19451", "ticketNumber": "XHZN4SI-19451",
        "testCaseName": "[XHZN4SI-19451] Opening and closing DisneyPlus", "priority": "P1",
        "status": status, "subStatus": "exception", "duration": 100,
        "reasons": [{"testStepName": "Navigate to Disney Plus", "status": "failed", "subStatus": "exception",
                     "reason": "Cannot read properties of undefined (reading 'order')"}],
        "report": "http://iw/inspectorweb/api/results_report/ta-2.html",
        "log": "http://iw/inspectorweb/logging/ta-2.log",
        "download": "http://iw/inspectorweb/api/executions/report/ta-2",
    }
    return {
        "stats": {"tests": 5, "passes": 2, "failures": 1, "pending": 2, "skipped": 1},
        "suites": {"suites": [{"tests": [
            {"title": "TestCase info", "state": "failed", "fail": True,
             "context": json.dumps([{"title": "TestCase info", "value": json.dumps(info)}])},
            {"title": "Open app store", "state": "passed", "pass": True},
            {"title": "Navigate to Disney Plus", "state": "failed", "fail": True,
             "err": {"message": "TypeError: Cannot read properties of undefined (reading 'order')"}},
            {"title": "Close app", "pending": True},
        ]}]},
    }


def test_parse_report_extracts_real_status_tags_and_failed_steps():
    d = iw.parse_report(_report(), "ta-2")
    assert d["status"] == "failed" and d["subStatus"] == "exception"
    assert d["tags"] == ["DisneyPlus"]  # de-duplicated
    assert d["featureTeam"] == "FT_APPS" and d["ticketNumber"] == "XHZN4SI-19451"
    assert d["failedSteps"] == [{"title": "Navigate to Disney Plus",
                                 "error": "TypeError: Cannot read properties of undefined (reading 'order')"}]
    assert d["reasons"][0]["step"] == "Navigate to Disney Plus"
    assert d["reportUrl"].endswith("/results_report/ta-2.html") and d["logUrl"].endswith("/ta-2.log")
    assert d["stats"]["failures"] == 1


async def test_target_details_fetches_json_report_and_caches():
    client = _client(_resp(_report()))
    with patch.object(inspectorweb_client, "http_client", client):
        first = await iw.get_target_details("ta-2")
        second = await iw.get_target_details("ta-2")
    assert first is second and first["status"] == "failed"
    assert client.request.await_count == 1
    assert client.request.call_args.args[1] == f"{LAB}/inspectorweb/api/results_report/ta-2.json"


async def test_target_details_missing_report_is_none():
    with patch.object(inspectorweb_client, "http_client", _client(_resp({"message": "nope"}, status=404))):
        assert await iw.get_target_details("ta-x") is None


# ── Permission registry ──────────────────────────────────────────────────────

def test_effective_permissions():
    assert effective_permissions("admin", "[]") == ["regression.view", "regression.run"]
    assert effective_permissions("user", '["regression.run"]') == ["regression.view", "regression.run"]
    assert effective_permissions("user", '["regression.view"]') == ["regression.view"]
    assert effective_permissions("user", None) == []
    assert parse_permissions('["bogus", "regression.view"]') == ["regression.view"]
    assert parse_permissions("not json") == []
    assert not has_permission("user", '["regression.view"]', "regression.run")


# ── Router (auth + DB + mocked InspectorWeb) ─────────────────────────────────

_USERS = {
    "admin-token": ("boss@infosys.com", "admin", "[]"),
    "runner-token": ("kishor.m@infosys.com", "user", '["regression.run"]'),
    "viewer-token": ("viewer@infosys.com", "user", '["regression.view"]'),
    "plain-token": ("plain@infosys.com", "user", "[]"),
    "other-runner-token": ("other@infosys.com", "user", '["regression.run"]'),
    "pending-token": ("newcomer@infosys.com", "user", '["regression.run"]'),
}


def _payload(token: str) -> dict | None:
    if token not in _USERS:
        return None
    email, role, _ = _USERS[token]
    return {"sub": email, "type": "access", "jti": f"jti-{token}", "exp": 9_999_999_999,
            "user": {"email": email, "role": role}}


def _cookie(token: str) -> dict:
    return {"Cookie": f"access_token={token}"}


@pytest.fixture
def api(tmp_path):
    """TestClient with a throwaway SQLite DB, seeded users, and token-keyed auth."""
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'regression.db'}", poolclass=NullPool)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            for email, role, perms in _USERS.values():
                session.add(User(email=email, role=role, is_active=True, permissions=perms))
            await session.commit()

    asyncio.run(_setup())

    async def _get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    with (
        patch("app.auth.dependencies.decode_token", side_effect=_payload),
        patch("app.auth.dependencies._is_revoked", new_callable=AsyncMock, return_value=False),
        patch("app.core.redis.update_last_seen", new_callable=AsyncMock),
        patch("app.routers.regression.iw.warm_x_test_executions"),  # never hit the real lab from tests
    ):
        client = TestClient(app)
        client.session_factory = session_factory  # type: ignore[attr-defined]
        yield client
    app.dependency_overrides.pop(get_db, None)
    asyncio.run(engine.dispose())


def _rows(client, model, **where):
    async def _q():
        async with client.session_factory() as session:
            stmt = select(model)
            for k, v in where.items():
                stmt = stmt.where(getattr(model, k) == v)
            return (await session.execute(stmt)).scalars().all()
    return asyncio.run(_q())


@contextmanager
def _iw(**fns):
    """Patch functions of the regression service used by the router."""
    with patch.multiple("app.routers.regression.iw", **fns):
        yield


def test_reads_require_regression_view(api):
    with _iw(list_run_configs=AsyncMock(return_value={"data": [], "total": 0})):
        assert api.get(f"{BASE}/run-configs", headers=_cookie("plain-token")).status_code == 403
        assert api.get(f"{BASE}/run-configs", headers=_cookie("viewer-token")).status_code == 200
        assert api.get(f"{BASE}/run-configs", headers=_cookie("admin-token")).status_code == 200


def test_unreachable_inspectorweb_is_503(api):
    with _iw(get_meta=AsyncMock(side_effect=iw.InspectorWebUnavailable("down"))):
        assert api.get(f"{BASE}/meta", headers=_cookie("viewer-token")).status_code == 503


def test_viewer_cannot_trigger(api):
    execute = AsyncMock()
    with _iw(execute_run_config=execute):
        r = api.post(f"{BASE}/runs", json={"runConfigUuid": RC_UUID}, headers=_cookie("viewer-token"))
    assert r.status_code == 403
    execute.assert_not_awaited()


def test_runner_triggers_saved_config(api):
    execute = AsyncMock(return_value=RUN_UUID)
    with _iw(get_run_config=AsyncMock(return_value={"name": "CPE_MONITOR_V32", "owner": "kishor.m"}), execute_run_config=execute):
        r = api.post(f"{BASE}/runs", json={"runConfigUuid": RC_UUID}, headers=_cookie("runner-token"))
    assert r.status_code == 201, r.text
    assert r.json()["runUuid"] == RUN_UUID
    execute.assert_awaited_once_with(RC_UUID, "kishor.m")
    run = _rows(api, RegressionRun, run_uuid=RUN_UUID)[0]
    assert run.triggered_by_email == "kishor.m@infosys.com"
    assert json.loads(run.payload_json) == {"uuid": RC_UUID, "username": "kishor.m"}


def test_trigger_falls_back_to_name_lookup(api):
    with _iw(
        get_run_config=AsyncMock(return_value={"name": "CPE_MONITOR_V32", "owner": "kishor.m"}),
        execute_run_config=AsyncMock(return_value=None),
        find_recent_run_uuid=AsyncMock(return_value=RUN_UUID),
    ):
        r = api.post(f"{BASE}/runs", json={"runConfigUuid": RC_UUID}, headers=_cookie("runner-token"))
    assert r.json()["runUuid"] == RUN_UUID


def test_trigger_unknown_config_is_404(api):
    execute = AsyncMock()
    with _iw(get_run_config=AsyncMock(return_value=None), execute_run_config=execute):
        r = api.post(f"{BASE}/runs", json={"runConfigUuid": RC_UUID}, headers=_cookie("runner-token"))
    assert r.status_code == 404
    execute.assert_not_awaited()


def _trigger(api, token="runner-token"):
    with _iw(get_run_config=AsyncMock(return_value={"name": "X", "owner": "kishor.m"}), execute_run_config=AsyncMock(return_value=RUN_UUID)):
        api.post(f"{BASE}/runs", json={"runConfigUuid": RC_UUID}, headers=_cookie(token))


def test_stop_owner_or_admin_only(api):
    _trigger(api)
    stop = AsyncMock()
    with _iw(stop_run=stop):
        assert api.post(f"{BASE}/runs/{RUN_UUID}/stop", headers=_cookie("other-runner-token")).status_code == 403
        assert api.post(f"{BASE}/runs/{RUN_UUID}/stop", headers=_cookie("viewer-token")).status_code == 403
        assert api.post(f"{BASE}/runs/{RUN_UUID}/stop", headers=_cookie("runner-token")).status_code == 200
        assert api.post(f"{BASE}/runs/{RUN_UUID}/stop", headers=_cookie("admin-token")).status_code == 200
    assert stop.await_args_list[0].args == (RUN_UUID, "kishor.m")
    assert stop.await_args_list[1].args == (RUN_UUID, "boss")


def test_status_snapshots_terminal_run(api):
    _trigger(api)
    live = {
        "runUuid": RUN_UUID, "name": "X", "status": "DONE", "statusId": 9, "phase": "done", "isTerminal": True,
        "runInfo": {"total": 3, "PASSED": 2, "FAILED": 1, "SKIPPED": 0, "UNKNOWN": 0}, "counts": {},
        "error": None, "targets": [],
    }
    with _iw(get_run_status=AsyncMock(return_value=live)):
        r = api.get(f"{BASE}/runs/{RUN_UUID}", headers=_cookie("viewer-token"))
    assert r.status_code == 200 and r.json()["source"] == "live"
    run = _rows(api, RegressionRun, run_uuid=RUN_UUID)[0]
    assert run.phase == "done" and run.finished_at is not None
    assert json.loads(run.run_info_json)["FAILED"] == 1

    # Purged upstream → served from the snapshot.
    with _iw(get_run_status=AsyncMock(return_value=None)):
        r = api.get(f"{BASE}/runs/{RUN_UUID}", headers=_cookie("viewer-token"))
    assert r.status_code == 200
    assert r.json()["source"] == "snapshot" and r.json()["runInfo"]["FAILED"] == 1


def test_target_details_route(api):
    with _iw(get_target_details=AsyncMock(return_value={"targetUuid": "ta-2", "tags": ["DisneyPlus"]})):
        r = api.get(f"{BASE}/runs/{RUN_UUID}/targets/ta-2/details", headers=_cookie("viewer-token"))
        assert r.status_code == 200 and r.json()["tags"] == ["DisneyPlus"]
        assert api.get(f"{BASE}/runs/{RUN_UUID}/targets/ta-2/details",
                       headers=_cookie("plain-token")).status_code == 403
    with _iw(get_target_details=AsyncMock(return_value=None)):
        r = api.get(f"{BASE}/runs/{RUN_UUID}/targets/ta-2/details", headers=_cookie("viewer-token"))
        assert r.status_code == 404


def test_list_runs_own_or_everyones_for_admins(api):
    _trigger(api)  # started by kishor.m (runner)
    assert len(api.get(f"{BASE}/runs", headers=_cookie("runner-token")).json()) == 1
    assert api.get(f"{BASE}/runs", headers=_cookie("viewer-token")).json() == []  # not theirs
    assert api.get(f"{BASE}/runs?scope=all", headers=_cookie("viewer-token")).status_code == 403
    assert api.get(f"{BASE}/runs", headers=_cookie("admin-token")).json() == []  # admin's own
    everyone = api.get(f"{BASE}/runs?scope=all", headers=_cookie("admin-token")).json()
    assert len(everyone) == 1 and everyone[0]["triggeredBy"] == "kishor.m@infosys.com"
    assert api.get(f"{BASE}/runs", headers=_cookie("plain-token")).status_code == 403


def test_admin_grants_permission_effective_immediately(api):
    plain = _rows(api, User, email="plain@infosys.com")[0]
    assert api.get(f"{BASE}/runs", headers=_cookie("plain-token")).status_code == 403

    r = api.patch(f"/api/v1/admin/users/{plain.id}/permissions",
                  json={"permissions": ["bogus"]}, headers=_cookie("admin-token"))
    assert r.status_code == 422

    assert api.patch(f"/api/v1/admin/users/{plain.id}/permissions",
                     json={"permissions": ["regression.view"]}, headers=_cookie("runner-token")).status_code == 403

    r = api.patch(f"/api/v1/admin/users/{plain.id}/permissions",
                  json={"permissions": ["regression.view", "regression.view"]}, headers=_cookie("admin-token"))
    assert r.status_code == 200 and r.json()["permissions"] == ["regression.view"]
    assert api.get(f"{BASE}/runs", headers=_cookie("plain-token")).status_code == 200  # same token, no refresh

    registry = api.get("/api/v1/admin/permissions", headers=_cookie("admin-token")).json()
    assert [p["key"] for p in registry] == ["regression.view", "regression.run"]


def test_auth_me_returns_effective_permissions(api):
    assert api.get("/api/v1/auth/me", headers=_cookie("runner-token")).json()["permissions"] == [
        "regression.view", "regression.run",
    ]
    assert api.get("/api/v1/auth/me", headers=_cookie("admin-token")).json()["permissions"] == [
        "regression.view", "regression.run",
    ]
    assert api.get("/api/v1/auth/me", headers=_cookie("plain-token")).json()["permissions"] == []


# ── Own run configs, create, logs ────────────────────────────────────────────

def test_run_configs_scoped_to_owner(api):
    lister = AsyncMock(return_value={"data": [], "total": 0})
    with _iw(list_run_configs=lister):
        api.get(f"{BASE}/run-configs?all=true", headers=_cookie("runner-token"))
        api.get(f"{BASE}/run-configs?all=true", headers=_cookie("admin-token"))
        api.get(f"{BASE}/run-configs", headers=_cookie("admin-token"))
    assert lister.await_args_list[0].kwargs["owner"] == "kishor.m"  # all=true ignored for non-admin
    assert lister.await_args_list[1].kwargs["owner"] is None
    assert lister.await_args_list[2].kwargs["owner"] == "boss"


def test_cannot_trigger_someone_elses_config(api):
    execute = AsyncMock()
    with _iw(get_run_config=AsyncMock(return_value={"name": "X", "owner": "nrani"}), execute_run_config=execute):
        r = api.post(f"{BASE}/runs", json={"runConfigUuid": RC_UUID}, headers=_cookie("runner-token"))
        assert r.status_code == 404
        assert api.get(f"{BASE}/run-configs/{RC_UUID}", headers=_cookie("runner-token")).status_code == 404
        assert api.get(f"{BASE}/run-configs/{RC_UUID}", headers=_cookie("admin-token")).status_code == 200
    execute.assert_not_awaited()


_CREATE = {
    "name": "KM_Search_Smoke-01",
    "branch": "master",
    "testCases": ["/testCases/XHZN4SI/Search/[XHZN4SI-36841]_Navigate-the-search-results.js"],
    "targets": [[{"type": "name", "value": "HArchive_021"}]],
    "timeOut": 2700000,
    "labels": ["Smoke", " "],
    "group": "CONTINUOUS",
    "mochaHooks": {"beforeEachRun": ["forcePowerOn"], "afterEachStep": []},
    "runParallel": False,
}


def test_build_run_config_matches_editor_shape():
    payload = iw.build_run_config(
        name="KM_1", username="kishor.m", branch="master", test_cases=["/testCases/a.js"], jql=[],
        targets=[[{"type": "name", "value": "HArchive_021"}]], time_out=3600000, labels=["Smoke"],
        group="CONTINUOUS", mocha_hooks={"beforeEachRun": ["forcePowerOn"], "afterEachTest": []},
        run_parallel=True,
    )
    assert payload["uuid"] is None and payload["username"] == "kishor.m" and payload["name"] == "KM_1"
    rc = payload["runconfig"]
    assert rc["targets"] == [[{"type": "name", "value": "HArchive_021", "regex": False}]]
    assert rc["group"] == ["CONTINUOUS"] and rc["projectKey"] == "HZN4SI" and rc["elastic"] is True
    assert rc["mochaHooks"] == {"beforeEachRun": ["forcePowerOn"]}  # empty phases dropped
    assert rc["runParallel"] is True and rc["runAsSeparateProcesses"] is True
    assert rc["elastic"] is True and rc["jiraResults"] == {"merge": False}
    assert "jiraData" not in rc
    xray = iw.build_run_config(
        name="KM_2", username="kishor.m", branch="master", test_cases=[], jql=["project = X"],
        targets=[[{"type": "lockedForGroup", "value": "CONTINUOUS"}]], time_out=3600000, labels=[],
        group=None, mocha_hooks={}, run_parallel=False,
    )
    assert xray["runconfig"]["jiraData"] == {"jql": ["project = X"], "xray": True}
    assert "group" not in xray["runconfig"]


async def test_save_run_config_posts_payload():
    client = _client(_resp({"uuid": RC_UUID}))
    with patch.object(inspectorweb_client, "http_client", client):
        assert await iw.save_run_config({"name": "KM_1"}, "kishor.m") == RC_UUID
    method, url = client.request.call_args.args
    assert (method, url) == ("POST", f"{LAB}/inspectorweb/api/run-config/save")
    assert client.request.call_args.kwargs["headers"]["Inspector-User"] == "kishor.m"


def test_create_run_config_route(api):
    save = AsyncMock(return_value=None)
    with _iw(save_run_config=save, find_run_config_uuid=AsyncMock(return_value=RC_UUID),
             get_run_config=AsyncMock(return_value={"uuid": RC_UUID, "name": "KM_Search_Smoke-01", "owner": "kishor.m"})):
        r = api.post(f"{BASE}/run-configs", json=_CREATE, headers=_cookie("runner-token"))
        assert r.status_code == 201, r.text
        assert r.json()["uuid"] == RC_UUID
        payload, username = save.await_args.args
        assert username == "kishor.m" and payload["username"] == "kishor.m"
        assert payload["runconfig"]["labels"] == ["Smoke"]
        assert payload["runconfig"]["testCases"] == _CREATE["testCases"]
        assert payload["runconfig"]["elastic"] is True  # default on

        api.post(f"{BASE}/run-configs", json={**_CREATE, "elastic": False, "jiraResultsMerge": True},
                 headers=_cookie("runner-token"))
        rc2 = save.await_args.args[0]["runconfig"]
        assert rc2["elastic"] is False and rc2["jiraResults"] == {"merge": True}
        assert "metadata" not in rc2  # empty metadata is omitted

        api.post(f"{BASE}/run-configs", json={**_CREATE, "metadata": {"currentVersion": "SR202-ae", "allowBento": True}},
                 headers=_cookie("runner-token"))
        assert save.await_args.args[0]["runconfig"]["metadata"] == {"currentVersion": "SR202-ae", "allowBento": True}
        bad_meta = api.post(f"{BASE}/run-configs", json={**_CREATE, "metadata": {" ": "x"}}, headers=_cookie("runner-token"))
        assert bad_meta.status_code == 422

        assert api.post(f"{BASE}/run-configs", json=_CREATE, headers=_cookie("viewer-token")).status_code == 403
        bad = api.post(f"{BASE}/run-configs", json={**_CREATE, "name": "has space"}, headers=_cookie("runner-token"))
        assert bad.status_code == 422
        none = api.post(f"{BASE}/run-configs", json={**_CREATE, "testCases": [], "jql": []}, headers=_cookie("runner-token"))
        assert none.status_code == 422
        hooks = api.post(f"{BASE}/run-configs", json={**_CREATE, "mochaHooks": {"whenever": ["x"]}}, headers=_cookie("runner-token"))
        assert hooks.status_code == 422
        no_group = {k: v for k, v in _CREATE.items() if k != "group"}
        assert api.post(f"{BASE}/run-configs", json=no_group, headers=_cookie("runner-token")).status_code == 422
        assert api.post(f"{BASE}/run-configs", json={**_CREATE, "group": "  "}, headers=_cookie("runner-token")).status_code == 422
    assert save.await_count == 3


async def test_search_test_cases_matches_all_terms():
    files = [{"basePath": "/testCases/XHZN4SI/Search/[XHZN4SI-36841]_Navigate.js", "name": "a"},
             {"basePath": "/testCases/XHZN4SI/Apps/[XHZN4SI-19451]Opening-closing-DisneyPlus.js", "name": "b"}]
    with patch.object(iw, "list_test_cases", AsyncMock(return_value=files)):
        assert (await iw.search_test_cases("master", "disney opening", 50))["total"] == 1
        assert (await iw.search_test_cases("master", None, 1)) == {"total": 2, "data": files[:1]}


async def test_log_tail_request():
    client = _client(_resp("[INFO] step 1\n[ERROR] boom\n", content_type="text/html; charset=utf-8"))
    with patch.object(inspectorweb_client, "http_client", client):
        text = await iw.get_log_tail("a39adc3e-277f-480f-940b-600e725a4e05", "error", 200)
    assert "boom" in text
    kwargs = client.request.call_args.kwargs
    assert client.request.call_args.args[1] == f"{LAB}/inspectorweb/api/logging"
    assert kwargs["params"] == {"file": "a39adc3e-277f-480f-940b-600e725a4e05.error.log", "lines": 200}


def test_logs_route(api):
    ta = "a39adc3e-277f-480f-940b-600e725a4e05"
    with _iw(get_log_tail=AsyncMock(return_value="[INFO] hello\n")):
        r = api.get(f"{BASE}/runs/{RUN_UUID}/targets/{ta}/logs?lines=50", headers=_cookie("viewer-token"))
        assert r.status_code == 200 and r.text == "[INFO] hello\n"
        assert api.get(f"{BASE}/runs/{RUN_UUID}/targets/../logs", headers=_cookie("viewer-token")).status_code in (404, 422)
        assert api.get(f"{BASE}/runs/{RUN_UUID}/targets/not-a-uuid/logs", headers=_cookie("viewer-token")).status_code == 422
    with _iw(get_log_tail=AsyncMock(side_effect=iw.InspectorWebRejected(404, "nope"))):
        r = api.get(f"{BASE}/runs/{RUN_UUID}/targets/{ta}/logs", headers=_cookie("viewer-token"))
        assert r.status_code == 200 and r.headers["x-log-missing"] == "1"


# ── Platforms: STB / OTT / both ──────────────────────────────────────────────

_OTT_DEVICES = [[{"type": "location", "value": "BROWSERSTACK"}, {"type": "deviceType", "value": "BROWSER"},
                 {"type": "platform", "value": "OS X VENTURA"}]]
_PROV = {"labe2esi": {"branch": "release", "sprint": "5.32.157", "version": "latest"}}


def _build(**kw):
    base = dict(name="KM_1", username="kishor.m", branch="master", test_cases=["/testCases/a.js"], jql=[],
                targets=[[{"type": "name", "value": "HArchive_021"}]], time_out=3600000, labels=[],
                group="FT_PERS", mocha_hooks={}, run_parallel=False)
    base.update(kw)
    return iw.build_run_config(**base)["runconfig"]


def test_build_platform_rules_match_inspectorweb_editor():
    stb = _build()
    assert "targets" in stb and "devices" not in stb and stb["provisioning"] == {}

    both = _build(platforms=["STB", "OTT"], devices=_OTT_DEVICES, provisioning=_PROV, lab="ignored")
    assert both["targets"] and both["devices"][0][0] == {"type": "location", "value": "BROWSERSTACK", "regex": False}
    assert both["provisioning"] == _PROV and "lab" not in both  # lab only for OTT-only

    ott = _build(platforms=["OTT"], devices=_OTT_DEVICES, lab="obolab_cloud_labci", targets=[])
    assert "targets" not in ott and ott["devices"] and ott["lab"] == "obolab_cloud_labci"


def test_provisioning_lab_key():
    assert iw.provisioning_lab_key("obolab_cloud_labci") == "labci"
    assert iw.provisioning_lab_key("obolab_labe2esi") == "labe2esi"


def test_create_platform_validation(api):
    save = AsyncMock(return_value=RC_UUID)
    ok_get = AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "kishor.m"})
    with _iw(save_run_config=save, get_run_config=ok_get):
        post = lambda body: api.post(f"{BASE}/run-configs", json=body, headers=_cookie("runner-token"))
        ott_only = {**_CREATE, "platforms": ["OTT"], "targets": [], "group": None, "devices": _OTT_DEVICES}
        assert post(ott_only).status_code == 201, post(ott_only).text
        rc = save.await_args.args[0]["runconfig"]
        assert "targets" not in rc and rc["devices"]

        assert post({**_CREATE, "platforms": ["OTT"], "devices": []}).status_code == 422          # OTT without devices
        assert post({**_CREATE, "platforms": ["STB", "OTT"], "devices": _OTT_DEVICES}).status_code == 422  # provisioning missing
        both = {**_CREATE, "platforms": ["OTT", "STB"], "devices": _OTT_DEVICES, "provisioning": _PROV}
        assert post(both).status_code == 201
        rc = save.await_args.args[0]["runconfig"]
        assert rc["provisioning"]["labe2esi"]["sprint"] == "5.32.157" and rc["targets"] and rc["devices"]
        assert post({**_CREATE, "platforms": ["STB"], "targets": []}).status_code == 422          # STB without boxes
        assert post({**_CREATE, "platforms": []}).status_code == 422
        bad_type = {**ott_only, "devices": [[{"type": "cpe_id", "value": "x"}]]}
        assert post(bad_type).status_code == 422


async def test_match_targets_summarises_devices():
    rows = [{"name": "HArchive_021", "lab": "obolab_cloud_labe2esi", "status": "IDLE", "location": "J7-007"},
            {"name": "BS_CHROME#1", "lab": None, "status": "RUNNING", "location": "BROWSERSTACK"}]
    client = _client(_resp(rows))
    with patch.object(inspectorweb_client, "http_client", client):
        res = await iw.match_targets("stb", [[{"type": "name", "value": "HArchive_021"}]])
    assert client.request.call_args.args == ("POST", f"{LAB}/inspectorweb/api/v2/targets/stb/translate-by-labels")
    assert client.request.call_args.kwargs["json"] == {"labels": [[{"type": "name", "value": "HArchive_021", "regex": False}]]}
    assert res["count"] == 2 and res["idle"] == 1 and res["browserstack"] == 1
    assert res["labs"] == ["obolab_cloud_labe2esi"] and res["provisioningLabs"] == ["labe2esi"]


def test_ott_lookup_routes(api):
    with _iw(get_ott_options=AsyncMock(return_value={"location": ["BROWSERSTACK"]}),
             get_app_versions=AsyncMock(return_value={})) as _:
        assert api.get(f"{BASE}/ott-options", headers=_cookie("viewer-token")).json() == {"location": ["BROWSERSTACK"]}
        assert api.get(f"{BASE}/app-versions?platforms=OS%20X%20VENTURA", headers=_cookie("viewer-token")).json() == {}
    with _iw(match_targets=AsyncMock(return_value={"count": 3})) as _:
        r = api.post(f"{BASE}/targets/match", json={"type": "ott", "groups": _OTT_DEVICES}, headers=_cookie("viewer-token"))
        assert r.json() == {"count": 3}


# ── Run-config overview actions: filters, raw, edit, delete, save & execute ──

def test_moam_url_matches_inspectorweb():
    assert iw.moam_url("abc") == (
        "http://odh.ecx.appdev.io/kibana6/app/dashboards#/view/79743a10-7707-11ed-8257-bf0af257272b"
        "?_g=(filters:!(('$state':(store:globalState),meta:(alias:!n,disabled:!f,index:'inspector-monitor*',"
        "key:runconfig.uuid,negate:!f,params:!('abc'),type:phrases),query:(bool:(minimum_should_match:1,"
        "should:!((match_phrase:(runconfig.uuid:'abc'))))))),refreshInterval:(pause:!t,value:216000000),"
        "time:(from:now-24h,to:now))"
    )


async def test_list_run_configs_filter_params():
    client = _client(_resp({"data": [], "meta": {}}))
    with patch.object(inspectorweb_client, "http_client", client):
        await iw.list_run_configs("smoke", 2, 15, owner="kishor.m", uuid=RC_UUID, label="X_Monitor")
    p = client.request.call_args.kwargs["params"]
    assert p["name[0]"] == "smoke" and p["username[0]"] == "kishor.m" and p["uuid"] == RC_UUID
    assert p["label[0]"] == "X_Monitor" and p["page"] == 2 and p["pageSize"] == 15


def test_build_with_uuid_is_an_update():
    payload = iw.build_run_config(name="KM_1", username="kishor.m", branch="master", test_cases=["/a.js"], jql=[],
                                  targets=[[{"type": "name", "value": "x"}]], time_out=3600000, labels=[],
                                  group="G", mocha_hooks={}, run_parallel=False, uuid=RC_UUID)
    assert payload["uuid"] == RC_UUID and payload["runconfig"]["runConfigUUID"] == RC_UUID


def test_run_configs_route_filters(api):
    lister = AsyncMock(return_value={"data": [], "total": 0})
    with _iw(list_run_configs=lister):
        api.get(f"{BASE}/run-configs?label=Smoke&uuid={RC_UUID}&username=nrani", headers=_cookie("runner-token"))
        api.get(f"{BASE}/run-configs?all=true&username=nrani", headers=_cookie("admin-token"))
        assert api.get(f"{BASE}/run-configs?uuid=not-a-uuid", headers=_cookie("runner-token")).status_code == 422
    first, second = lister.await_args_list
    assert first.kwargs == {"owner": "kishor.m", "uuid": RC_UUID, "label": "Smoke"}  # username ignored for non-admins
    assert second.kwargs["owner"] == "nrani"


def test_filter_options_route(api):
    opts = AsyncMock(return_value=["KM_1"])
    with _iw(run_config_filter_options=opts):
        assert api.get(f"{BASE}/run-configs/filter-options?column=username", headers=_cookie("runner-token")).json() == ["kishor.m"]
        assert api.get(f"{BASE}/run-configs/filter-options?column=name&q=KM", headers=_cookie("runner-token")).json() == ["KM_1"]
        assert api.get(f"{BASE}/run-configs/filter-options?column=bogus", headers=_cookie("runner-token")).status_code == 422
    assert opts.await_args.args == ("name", "KM", "kishor.m")


def test_raw_route_owner_only(api):
    row = {"uuid": RC_UUID, "name": "X", "username": "nrani", "updated": "t", "runconfig": {"branch": "master"}, "id": 9}
    with _iw(get_run_config_raw=AsyncMock(return_value=row)):
        assert api.get(f"{BASE}/run-configs/{RC_UUID}/raw", headers=_cookie("runner-token")).status_code == 404
        r = api.get(f"{BASE}/run-configs/{RC_UUID}/raw", headers=_cookie("admin-token"))
        assert r.status_code == 200 and r.json() == {k: row[k] for k in ("uuid", "name", "username", "updated", "runconfig")}


def test_edit_and_delete_owner_only(api):
    mine = AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "kishor.m"})
    theirs = AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "nrani"})
    save, expire = AsyncMock(return_value=RC_UUID), AsyncMock()
    with _iw(get_run_config=theirs, save_run_config=save, expire_run_config=expire):
        assert api.put(f"{BASE}/run-configs/{RC_UUID}", json=_CREATE, headers=_cookie("admin-token")).status_code == 403
        assert api.delete(f"{BASE}/run-configs/{RC_UUID}", headers=_cookie("admin-token")).status_code == 403
        assert api.delete(f"{BASE}/run-configs/{RC_UUID}", headers=_cookie("viewer-token")).status_code == 403
    save.assert_not_awaited(); expire.assert_not_awaited()
    with _iw(get_run_config=mine, save_run_config=save, expire_run_config=expire):
        r = api.put(f"{BASE}/run-configs/{RC_UUID}", json=_CREATE, headers=_cookie("runner-token"))
        assert r.status_code == 200 and r.json()["run"] is None
        payload, username = save.await_args.args
        assert payload["uuid"] == RC_UUID and username == "kishor.m"
        assert api.delete(f"{BASE}/run-configs/{RC_UUID}", headers=_cookie("runner-token")).status_code == 204
    expire.assert_awaited_once_with(RC_UUID, "kishor.m")


def test_save_and_execute(api):
    execute = AsyncMock(return_value=RUN_UUID)
    with _iw(save_run_config=AsyncMock(return_value=RC_UUID), execute_run_config=execute,
             get_run_config=AsyncMock(return_value={"uuid": RC_UUID, "name": "KM_Search_Smoke-01", "owner": "kishor.m"})):
        r = api.post(f"{BASE}/run-configs?execute=true", json=_CREATE, headers=_cookie("runner-token"))
    assert r.status_code == 201, r.text
    assert r.json()["run"]["runUuid"] == RUN_UUID
    execute.assert_awaited_once_with(RC_UUID, "kishor.m")
    assert _rows(api, RegressionRun, run_uuid=RUN_UUID)[0].run_config_uuid == RC_UUID


# ── Executions of one run config (right panel filter) ───────────────────────

async def test_executions_for_run_config_keeps_only_that_config():
    mine = {**_rc_row("DONE", run_info={"total": 2, "FAILED": 1, "PASSED": 1, "SKIPPED": 0, "UNKNOWN": 0}),
            "id": 69552379, "config": {"config": {"runConfigUUID": RC_UUID, "username": "nrani"}}}
    other = {**_rc_row("RUNNING"), "uuid_rc": "other-run", "name": "CPE_MONITOR_V32_COPY", "id": 5,
             "config": {"config": {"runConfigUUID": "someone-else"}}}
    client = _client(_resp({"data": [mine, other]}))
    with patch.object(inspectorweb_client, "http_client", client):
        runs = await iw.list_executions_for_run_config(RC_UUID, "CPE_MONITOR_V32")
    params = client.request.call_args.kwargs["params"]
    assert params["name[0]"] == "CPE_MONITOR_V32" and params["type"] == "RUNCONFIG"
    assert [r["runUuid"] for r in runs] == [RUN_UUID]
    r = runs[0]
    assert r["id"] == -69552379 and r["phase"] == "done" and r["triggeredBy"] == "nrani"
    assert r["runInfo"]["FAILED"] == 1 and r["source"] == "inspectorweb"


def test_runs_for_config_merges_app_and_inspectorweb(api):
    _trigger(api)  # local run RUN_UUID for RC_UUID
    remote = [
        {"id": -9, "runUuid": RUN_UUID, "name": "X", "createdAt": "2026-11-01T09:00:00+00:00", "source": "inspectorweb"},
        {"id": -8, "runUuid": "external-run", "name": "X", "createdAt": "2026-11-01T08:00:00+00:00", "source": "inspectorweb"},
    ]
    with _iw(get_run_config=AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "kishor.m"}),
             list_executions_for_run_config=AsyncMock(return_value=remote)):
        r = api.get(f"{BASE}/runs?runConfigUuid={RC_UUID}", headers=_cookie("runner-token"))
    assert r.status_code == 200
    by_uuid = {x["runUuid"]: x for x in r.json()}
    assert set(by_uuid) == {RUN_UUID, "external-run"}
    assert by_uuid[RUN_UUID]["source"] == "app"           # the app's record wins (has trigger audit)
    assert by_uuid["external-run"]["source"] == "inspectorweb"


def test_runs_for_config_hidden_for_other_owners(api):
    with _iw(get_run_config=AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "nrani"}),
             list_executions_for_run_config=AsyncMock(return_value=[])):
        assert api.get(f"{BASE}/runs?runConfigUuid={RC_UUID}", headers=_cookie("runner-token")).status_code == 404
        assert api.get(f"{BASE}/runs?runConfigUuid={RC_UUID}", headers=_cookie("admin-token")).status_code == 200


def test_runs_for_config_falls_back_to_app_runs_when_unreachable(api):
    _trigger(api)
    with _iw(get_run_config=AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "kishor.m"}),
             list_executions_for_run_config=AsyncMock(side_effect=iw.InspectorWebUnavailable("down"))):
        r = api.get(f"{BASE}/runs?runConfigUuid={RC_UUID}", headers=_cookie("runner-token"))
    assert r.status_code == 200 and [x["runUuid"] for x in r.json()] == [RUN_UUID]


# ── Delete a run from this app's lists ───────────────────────────────────────

def _set_phase(api, phase: str):
    async def _q():
        async with api.session_factory() as session:
            run = (await session.execute(select(RegressionRun))).scalars().first()
            run.phase = phase
            await session.commit()
            return run.id
    return asyncio.run(_q())


def test_delete_run_rules(api):
    _trigger(api)  # kishor.m's run, phase "queued"
    run_id = _rows(api, RegressionRun, run_uuid=RUN_UUID)[0].id
    assert api.delete(f"{BASE}/runs/{run_id}", headers=_cookie("runner-token")).status_code == 409  # still running
    _set_phase(api, "done")
    assert api.delete(f"{BASE}/runs/{run_id}", headers=_cookie("other-runner-token")).status_code == 403
    assert api.delete(f"{BASE}/runs/{run_id}", headers=_cookie("plain-token")).status_code == 403  # no regression.view
    assert api.delete(f"{BASE}/runs/{run_id}", headers=_cookie("runner-token")).status_code == 204
    assert _rows(api, RegressionRun, run_uuid=RUN_UUID) == []
    assert api.delete(f"{BASE}/runs/{run_id}", headers=_cookie("runner-token")).status_code == 404


def test_admin_can_delete_any_run(api):
    _trigger(api)
    run_id = _set_phase(api, "aborted")
    assert api.delete(f"{BASE}/runs/{run_id}", headers=_cookie("admin-token")).status_code == 204


# ── Statuses and runs seen live on 2026-11-01 ────────────────────────────────

def test_invalid_and_ignored_are_terminal():
    assert iw.map_phase("INVALID") == "failed" and iw.map_phase("IGNORED") == "aborted"


async def test_invalid_run_shows_its_error():
    rc = {**_rc_row("INVALID", error="No devices found for given filter\n"), "counts": None}
    client = _client(_resp({"data": [rc]}), _resp({"data": []}), _resp({"data": []}))
    with patch.object(inspectorweb_client, "http_client", client):
        status = await iw.get_run_status(RUN_UUID)
    assert status["isTerminal"] is True and status["phase"] == "failed"
    assert status["error"] == "No devices found for given filter"
    assert status["testCases"] == []


async def test_device_rows_without_testcase_rows_are_listed():
    ri = {"total": 1, "FAILED": 0, "PASSED": 0, "SKIPPED": 0, "UNKNOWN": 1}
    target = {"type": "TARGET", "uuid_tc": None, "uuid_ta": "ta-9", "name": "OBO_HR02-12", "status": "DONE", "error": None,
              "run_info": ri, "config": {"config": {"testCases": [
                  "/testCases/XHZN4SI/Applications/CPE/Stability/GB_Target/[XHZN4SI-19451]Opening-closing-DisneyPlus.js"]}}}
    client = _client(_resp({"data": [_rc_row("DONE", run_info=ri)]}), _resp({"data": []}), _resp({"data": [target]}))
    with patch.object(inspectorweb_client, "http_client", client):
        status = await iw.get_run_status(RUN_UUID)
    [tc] = status["testCases"]
    assert tc["testCaseUuid"] is None and tc["name"] == "[XHZN4SI-19451]Opening-closing-DisneyPlus"
    assert tc["outcome"] == "no_result" and tc["targets"][0]["targetUuid"] == "ta-9"
    assert tc["targets"][0]["reportUrl"].endswith("/results_report/ta-9.html")


# ── Xray JQL preview ─────────────────────────────────────────────────────────

async def test_preview_jql_matches_tickets_to_files():
    preview = [{"type": "jql", "input": "labels in (CPE_MONITOR)", "result": ["XHZN4SI-19451", "XHZN4SI-99999"]}]
    files = [{"basePath": "/testCases/XHZN4SI/Apps/[XHZN4SI-19451]Opening-closing-DisneyPlus.js", "name": "a"},
             {"basePath": "/testCases/XHZN4SI/Other/no-key.js", "name": "b"}]
    client = _client(_resp(preview))
    with patch.object(inspectorweb_client, "http_client", client), patch.object(iw, "list_test_cases", AsyncMock(return_value=files)):
        out = await iw.preview_jql("master", ["labels in (CPE_MONITOR)"])
    method, url = client.request.call_args.args
    assert (method, url) == ("POST", f"{LAB}/inspectorweb/api/v2/inspector/test-cases/preview")
    assert client.request.call_args.kwargs["json"] == {"query": {"jql": ["labels in (CPE_MONITOR)"]}}
    [q] = out
    assert q["count"] == 2
    assert q["tickets"][0] == {"key": "XHZN4SI-19451", "jiraUrl": "https://jira.lgi.io/browse/XHZN4SI-19451",
                               "files": ["/testCases/XHZN4SI/Apps/[XHZN4SI-19451]Opening-closing-DisneyPlus.js"]}
    assert q["tickets"][1]["files"] == []  # no automated script on this branch


def test_preview_route(api):
    with _iw(preview_jql=AsyncMock(return_value=[{"query": "q", "count": 0, "tickets": []}])) as _:
        r = api.post(f"{BASE}/test-cases/preview", json={"branch": "master", "jql": ["  q  ", ""]}, headers=_cookie("viewer-token"))
        assert r.status_code == 200 and r.json()[0]["count"] == 0
        assert api.post(f"{BASE}/test-cases/preview", json={"jql": ["  "]}, headers=_cookie("viewer-token")).status_code == 422
        assert api.post(f"{BASE}/test-cases/preview", json={"jql": ["q"]}, headers=_cookie("plain-token")).status_code == 403


# ── X Test Execution (Where To Report, Xray JQL) ─────────────────────────────

async def test_x_test_executions_search_is_cached():
    rows = [
        {"key": "XHZN4SI-76947", "fields": {"summary": "5.31.15507_Perseus_Automation_Regression_PREPROD_UK_IOS_Tablet"}},
        {"key": "XHZN4SI-76889", "fields": {"summary": " Android Test Execution 28th Oct"}},
        {"key": "XHZN4SI-37704", "fields": {}},
    ]
    client = _client(_resp(rows))
    with patch.object(inspectorweb_client, "http_client", client):
        by_key = await iw.search_x_test_executions("7688", 20)
        by_name = await iw.search_x_test_executions("android test", 20)
        first_two = await iw.search_x_test_executions(None, 2)
        exact = await iw.search_x_test_executions("xhzn4si-76889", 20)
    assert client.request.await_count == 1  # cached
    assert client.request.call_args.args[1] == f"{LAB}/inspectorweb/api/v2/jira-injector/x-test-executions"
    assert client.request.call_args.kwargs["params"] == {"fields": "summary"}
    assert by_key["items"] == [{"key": "XHZN4SI-76889", "summary": "Android Test Execution 28th Oct"}]
    assert by_key["exists"] is False and by_key["summary"] is None
    assert by_name["items"][0]["key"] == "XHZN4SI-76889"
    assert first_two["total"] == 3 and len(first_two["items"]) == 2 and first_two["exists"] is None
    assert exact["exists"] is True and exact["summary"] == "Android Test Execution 28th Oct"


def test_xray_payload_carries_test_execution(api):
    save = AsyncMock(return_value=RC_UUID)
    xray = {**_CREATE, "testCases": [], "jql": ["labels in (CPE_MONITOR)"], "jiraResultsMerge": True, "xTestExecution": "XHZN4SI-76889"}
    with _iw(save_run_config=save, get_run_config=AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "kishor.m"})):
        assert api.post(f"{BASE}/run-configs", json=xray, headers=_cookie("runner-token")).status_code == 201
        rc = save.await_args.args[0]["runconfig"]
        assert rc["jiraResults"] == {"xray": True, "merge": True, "xTestExecution": "XHZN4SI-76889"}
        assert api.post(f"{BASE}/run-configs", json={**xray, "xTestExecution": "not a key"}, headers=_cookie("runner-token")).status_code == 422
        api.post(f"{BASE}/run-configs", json={**xray, "xTestExecution": None}, headers=_cookie("runner-token"))
        assert save.await_args.args[0]["runconfig"]["jiraResults"]["xTestExecution"] == ""


# ── Schedules ────────────────────────────────────────────────────────────────

_SCHED_BODY = {"name": "KM_nightly", "runConfigUuids": [RC_UUID], "mode": "parallel", "type": "cron", "cron": "30 2 * * *",
               "when": {"type": "or", "value": [{"type": "days", "value": ["Saturday"]}]},
               "until": {"type": "or", "value": [{"type": "executions", "value": 3}]}}
_NAMES = {"data": [{"uuid": RC_UUID, "name": "CPE_MONITOR"}], "total": 1}


def test_schedule_routes_are_local(api):
    with _iw(list_run_configs=AsyncMock(return_value=_NAMES)):
        assert api.post(f"{BASE}/schedules", json=_SCHED_BODY, headers=_cookie("viewer-token")).status_code == 403
        r = api.post(f"{BASE}/schedules", json=_SCHED_BODY, headers=_cookie("runner-token"))
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["runConfigs"] == [{"uuid": RC_UUID, "name": "CPE_MONITOR"}] and s["owner"] == "kishor.m"
        assert s["type"] == "cron" and s["data"] == "30 2 * * *" and s["enabled"] and len(s["nextRuns"]) == 3
        uuid = s["uuid"]

        bad = [
            {**_SCHED_BODY, "name": "KM nightly"},  # same name rules as run configs
            {**_SCHED_BODY, "name": "x" * 121},
            {**_SCHED_BODY, "cron": None},
            {**_SCHED_BODY, "cron": "every day"},
            {**_SCHED_BODY, "cron": "0 0 2 * * *"},  # 6 fields (seconds) aren't supported
            {**_SCHED_BODY, "cron": "61 2 * * *"},
            {**_SCHED_BODY, "when": {"type": "or", "value": [{"type": "days", "value": ["Funday"]}]}},
            {**_SCHED_BODY, "until": {"type": "or", "value": [{"type": "status", "value": "maybe"}]}},
            {**_SCHED_BODY, "runConfigUuids": [RC_UUID, RC_UUID]},
        ]
        for body in bad:
            assert api.post(f"{BASE}/schedules", json=body, headers=_cookie("runner-token")).status_code == 422, body

        listed = api.get(f"{BASE}/schedules?q=night", headers=_cookie("runner-token")).json()
        assert listed["total"] == 1 and listed["data"][0]["uuid"] == uuid
        assert api.get(f"{BASE}/schedules?q=zzz", headers=_cookie("runner-token")).json()["total"] == 0
        assert api.get(f"{BASE}/schedules", headers=_cookie("other-runner-token")).json()["total"] == 0  # own only

        r = api.put(f"{BASE}/schedules/{uuid}", json={**_SCHED_BODY, "type": "once", "name": "KM_once"}, headers=_cookie("runner-token"))
        assert r.status_code == 200 and r.json()["type"] == "once" and r.json()["when"] is None and r.json()["nextRuns"] == []

        r = api.post(f"{BASE}/schedules/{uuid}/disable", headers=_cookie("runner-token"))
        assert r.status_code == 200 and r.json()["schedule"]["enabled"] is False
        assert api.post(f"{BASE}/schedules/{uuid}/explode", headers=_cookie("runner-token")).status_code == 422
        assert api.delete(f"{BASE}/schedules/{uuid}", headers=_cookie("runner-token")).status_code == 204
        assert api.get(f"{BASE}/schedules", headers=_cookie("runner-token")).json()["total"] == 0


def test_schedule_run_now_records_runs(api):
    execute = AsyncMock(return_value="run-1")
    with _iw(list_run_configs=AsyncMock(return_value=_NAMES), execute_run_config=execute):
        uuid = api.post(f"{BASE}/schedules", json=_SCHED_BODY, headers=_cookie("runner-token")).json()["uuid"]
        r = api.post(f"{BASE}/schedules/{uuid}/execute", headers=_cookie("runner-token"))
        assert r.status_code == 200, r.text
        assert r.json()["runs"][0]["runUuid"] == "run-1" and r.json()["schedule"]["state"]["executions"] == 1
        assert r.json()["schedule"]["state"]["currentRunUuid"] == "run-1"
        execute.assert_awaited_once_with(RC_UUID, "kishor.m")
        run = _rows(api, RegressionRun, run_uuid="run-1")[0]
        assert run.schedule_uuid == uuid and run.triggered_by_email == "kishor.m@infosys.com"
        # Still running → a second "run now" is refused.
        assert api.post(f"{BASE}/schedules/{uuid}/execute", headers=_cookie("runner-token")).status_code == 409


def test_schedule_run_now_reports_start_failure(api):
    failing = AsyncMock(side_effect=iw.InspectorWebRejected(404, "Cannot POST"))
    with _iw(list_run_configs=AsyncMock(return_value=_NAMES), execute_run_config=failing):
        uuid = api.post(f"{BASE}/schedules", json=_SCHED_BODY, headers=_cookie("runner-token")).json()["uuid"]
        r = api.post(f"{BASE}/schedules/{uuid}/execute", headers=_cookie("runner-token"))
        assert r.status_code == 502 and "CPE_MONITOR" in r.json()["detail"]


def test_schedule_owner_and_run_config_checks(api):
    with _iw(list_run_configs=AsyncMock(return_value=_NAMES)):
        uuid = api.post(f"{BASE}/schedules", json=_SCHED_BODY, headers=_cookie("runner-token")).json()["uuid"]
    for method, path in (("post", f"{uuid}/execute"), ("put", uuid), ("delete", uuid)):
        kw = {"json": _SCHED_BODY} if method == "put" else {}
        with _iw(list_run_configs=AsyncMock(return_value=_NAMES)):
            r = getattr(api, method)(f"{BASE}/schedules/{path}", headers=_cookie("other-runner-token"), **kw)
        assert r.status_code == 404, (method, r.text)
    # Someone else's run config can't be scheduled.
    with _iw(list_run_configs=AsyncMock(return_value={"data": [], "total": 0}),
             get_run_config=AsyncMock(return_value={"uuid": RC_UUID, "name": "X", "owner": "nrani"})):
        assert api.post(f"{BASE}/schedules", json=_SCHED_BODY, headers=_cookie("runner-token")).status_code == 404


# ── Batch preview ────────────────────────────────────────────────────────────

def _add_runs(client, *rows):
    async def _go():
        async with client.session_factory() as session:
            for r in rows:
                session.add(r)
            await session.commit()
    asyncio.run(_go())


def _run(run_uuid, *, email="kishor.m@infosys.com", phase="done", failed=0, finished=True, name="KM_run", hours_ago=1, schedule=None):
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    info = {"FAILED": failed, "PASSED": 1, "SKIPPED": 0, "UNKNOWN": 0, "total": failed + 1}
    return RegressionRun(
        run_uuid=run_uuid, run_config_uuid=RC_UUID, name=name, triggered_by_email=email, inspector_username=email.split("@")[0],
        inspectorweb_base_url=LAB, phase=phase, run_info_json=json.dumps(info), schedule_uuid=schedule,
        created_at=now - timedelta(hours=hours_ago), finished_at=now if finished else None,
    )


def test_batch_preview(api):
    from app.auth.models import RunAnalysis
    a, b, c, d, e = (f"{i}aaaaaaa-1111-4111-8111-111111111111" for i in range(1, 6))
    _add_runs(api,
              _run(a, failed=2), _run(b, phase="aborted"), _run(c),                 # failed, aborted, passed
              _run(d, phase="running", finished=False), _run(e, email="other@infosys.com", failed=1),
              RunAnalysis(run_uuid=a, status="DONE", verdict_count=2))
    body = {"sinceHours": 24}
    r = api.post(f"{BASE}/batch/preview", json=body, headers=_cookie("runner-token")).json()
    assert {x["runUuid"]: x["state"] for x in r["runs"]} == {a: "failed", b: "aborted"}
    assert r["totals"] == {"runs": 2, "failedTests": 2, "aborted": 1, "analysed": 1, "running": 1, "passedHidden": 1}
    assert next(x for x in r["runs"] if x["runUuid"] == a)["verdictCount"] == 2

    # Everyone's runs are for admins; users only ever get their own (also when picking runs).
    assert api.post(f"{BASE}/batch/preview", json={**body, "startedBy": "all"}, headers=_cookie("runner-token")).status_code == 403
    everyone = api.post(f"{BASE}/batch/preview", json={**body, "startedBy": "all", "onlyProblems": False}, headers=_cookie("admin-token")).json()
    assert {x["runUuid"] for x in everyone["runs"]} == {a, b, c, e}
    assert api.post(f"{BASE}/batch/preview", json={"runUuids": [e.upper()]}, headers=_cookie("runner-token")).json()["runs"] == []
    picked = api.post(f"{BASE}/batch/preview", json={"runUuids": [e.upper()]}, headers=_cookie("admin-token")).json()
    assert [x["runUuid"] for x in picked["runs"]] == [e]
    assert api.post(f"{BASE}/batch/preview", json={}, headers=_cookie("runner-token")).status_code == 422
    assert api.post(f"{BASE}/batch/preview", json=body, headers=_cookie("plain-token")).status_code == 403


# ── Dashboard ────────────────────────────────────────────────────────────────

def _today():
    from datetime import datetime
    return datetime.utcnow().strftime("%Y-%m-%d")


def test_regression_dashboard(api):
    from app.auth.models import RunAnalysis
    a, b, c, d, e = (f"{i}bbbbbbb-1111-4111-8111-111111111111" for i in range(1, 6))
    verdicts = json.dumps([{"testCaseRunId": "t1", "category": "ENVIRONMENT"}, {"testCaseRunId": "t2", "category": "ENVIRONMENT"},
                           {"testCaseRunId": "t3", "category": "KNOWN_ISSUE"}])
    _add_runs(api,
              _run(a, hours_ago=0, failed=2), _run(b, hours_ago=0, phase="aborted"), _run(c, hours_ago=0), _run(d, hours_ago=0, phase="running", finished=False),
              _run(e, hours_ago=0, email="other@infosys.com", failed=1),
              RunAnalysis(run_uuid=a, status="DONE", source="auto", verdict_count=3, verdicts_json=verdicts))
    q = f"from_date={_today()}&to_date={_today()}"
    r = api.get(f"{BASE}/dashboard?{q}", headers=_cookie("runner-token"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"] == {"runs": 4, "passed": 1, "failed": 1, "aborted": 1, "running": 1,
                               "testsPassed": 4, "testsFailed": 2, "failedRunTests": 2, "abortedRunTests": 0, "passRate": 66.7}
    assert body["byDay"][-1] == {"date": _today(), "passed": 1, "failed": 1, "aborted": 1, "running": 1}
    assert body["coverage"] == {"finished": 3, "analysed": 1, "waiting": 2,
                                "topCategories": [{"category": "ENVIRONMENT", "count": 2}, {"category": "KNOWN_ISSUE", "count": 1}]}
    assert [x["runUuid"] for x in body["running"]] == [d]

    # Everyone's runs are for admins only.
    assert api.get(f"{BASE}/dashboard?{q}&scope=all", headers=_cookie("runner-token")).status_code == 403
    everyone = api.get(f"{BASE}/dashboard?{q}&scope=all", headers=_cookie("admin-token")).json()
    assert everyone["summary"]["runs"] == 5
    assert api.get(f"{BASE}/dashboard?{q}", headers=_cookie("admin-token")).json()["summary"]["runs"] == 0  # admin's own
    assert api.get(f"{BASE}/dashboard?from_date=2026-13-01&to_date={_today()}", headers=_cookie("runner-token")).status_code == 400
    assert api.get(f"{BASE}/dashboard?{q}", headers=_cookie("plain-token")).status_code == 403


def test_regression_dashboard_schedules(api):
    with _iw(list_run_configs=AsyncMock(return_value=_NAMES)):
        api.post(f"{BASE}/schedules", json=_SCHED_BODY, headers=_cookie("runner-token"))
        stopped = api.post(f"{BASE}/schedules", json={**_SCHED_BODY, "name": "KM_once", "type": "once"}, headers=_cookie("runner-token")).json()
    from app.auth.models import RegressionSchedule

    async def _stop():
        async with api.session_factory() as session:
            s = (await session.execute(select(RegressionSchedule).where(RegressionSchedule.uuid == stopped["uuid"]))).scalars().first()
            s.status, s.enabled, s.stop_reason = "stopped", False, "Ran once"
            await session.commit()
    asyncio.run(_stop())
    body = api.get(f"{BASE}/dashboard?from_date={_today()}&to_date={_today()}", headers=_cookie("runner-token")).json()["schedules"]
    assert body["total"] == 2 and body["enabled"] == 1 and len(body["upcoming"]) == 3
    assert body["upcoming"][0]["name"] == "KM_nightly" and body["attention"] == [{"uuid": stopped["uuid"], "name": "KM_once", "reason": "Ran once"}]


def test_dashboard_stats_count_auto_analyses_once(api):
    """Auto-analysed Regression runs reach the Dashboard charts; a failure analysed twice counts once."""
    from app.auth.models import AnalysisJob, RunAnalysis
    a, b = (f"{i}ccccccc-1111-4111-8111-111111111111" for i in range(1, 3))
    v = lambda key, cat: {"testCaseRunId": key, "category": cat, "platform": "STB"}  # noqa: E731
    _add_runs(api, _run(a, hours_ago=0, failed=1), _run(b, hours_ago=0, failed=1),
              RunAnalysis(run_uuid=a, status="DONE", source="auto", verdict_count=2, verdicts_json=json.dumps([v("t1", "ENVIRONMENT"), v("t2", "KNOWN_ISSUE")])),
              RunAnalysis(run_uuid=b, status="DONE", source="auto", verdict_count=1, verdicts_json=json.dumps([v("t9", "UNKNOWN")])),
              AnalysisJob(uid="j1", user_email="kishor.m@infosys.com", mode="sync", run_uuid=a, job_id="j1", status="DONE",
                          verdict_count=1, verdicts_json=json.dumps([v("t1", "ENVIRONMENT")])))
    with patch("app.routers.rca.AsyncSessionLocal", api.session_factory):
        r = api.get(f"/api/v1/rca/stats?from_date={_today()}&to_date={_today()}", headers=_cookie("runner-token"))
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["totalVerdicts"] == 3 and s["categoryBreakdown"] == {"ENVIRONMENT": 1, "KNOWN_ISSUE": 1, "UNKNOWN": 1}
    assert s["autoAnalysedRuns"] == 2 and s["autoVerdictsByDay"] == {_today(): 2}


def test_timed_out_run_counts_as_aborted(api):
    """InspectorWeb marks a run it cut off as DONE with "Abort by Inspector: Time Out …"."""
    from app.services.inspectorweb_regression import run_phase
    assert run_phase("DONE", "Abort by Inspector: Time Out on Run Configuration Timer of 60 minutes") == "aborted"
    assert run_phase("DONE", None) == "done" and run_phase("DONE", "AssertionError: expected") == "done"
    a = "1ddddddd-1111-4111-8111-111111111111"
    row = _run(a, hours_ago=0, failed=12)
    row.phase, row.error = "aborted", "Abort by Inspector: Time Out on Run Configuration Timer of 60 minutes"
    _add_runs(api, row)
    s = api.get(f"{BASE}/dashboard?from_date={_today()}&to_date={_today()}", headers=_cookie("runner-token")).json()["summary"]
    assert s["aborted"] == 1 and s["failed"] == 0 and s["abortedRunTests"] == 12 and s["failedRunTests"] == 0
    preview = api.post(f"{BASE}/batch/preview", json={"sinceHours": 24}, headers=_cookie("runner-token")).json()
    assert preview["runs"][0]["state"] == "aborted" and preview["runs"][0]["runInfo"]["FAILED"] == 12


def test_unreachable_messages_say_what_to_do():
    """Connection timeouts carry no text — the message must still explain the cause."""
    import httpx
    from app.services.inspectorweb_regression import unreachable_message as m
    assert "not on the VPN" in m(httpx.ConnectTimeout("")) and "iw-lab.example" not in m(httpx.ConnectTimeout(""))  # no hostnames on screen
    assert "didn't answer in time" in m(httpx.ReadTimeout(""))
    assert "Can't find InspectorWeb's address" in m(httpx.ConnectError("[Errno 8] nodename nor servname provided"))
    assert "refused the connection" in m(httpx.ConnectError("[Errno 61] Connection refused"))
    assert not m(httpx.ConnectTimeout("")).rstrip().endswith(":")


def test_run_stored_analysis(api):
    from app.auth.models import RunAnalysis
    a, b = (f"{i}eeeeeee-1111-4111-8111-111111111111" for i in range(1, 3))
    _add_runs(api, _run(a, hours_ago=0, failed=1, name="FT_AVAD"), _run(b, hours_ago=0, phase="aborted"),
              RunAnalysis(run_uuid=a, status="DONE", source="auto", verdict_count=1,
                          verdicts_json=json.dumps([{"testCaseRunId": "t1", "category": "ENVIRONMENT"}])),
              RunAnalysis(run_uuid=b, status="SKIPPED", source="batch", reason="Execution was Aborted"))
    r = api.get(f"{BASE}/runs/{a.upper()}/analysis", headers=_cookie("viewer-token")).json()
    assert r["status"] == "DONE" and r["source"] == "auto" and r["runName"] == "FT_AVAD"
    assert r["verdicts"] == [{"testCaseRunId": "t1", "category": "ENVIRONMENT", "runUuid": a, "runName": "FT_AVAD"}]
    s = api.get(f"{BASE}/runs/{b}/analysis", headers=_cookie("viewer-token")).json()
    assert s["status"] == "FAILED" and s["reason"] == "Execution was Aborted" and s["verdicts"] == []
    assert api.get(f"{BASE}/runs/3fffffff-1111-4111-8111-111111111111/analysis", headers=_cookie("viewer-token")).status_code == 404
    assert api.get(f"{BASE}/runs/{a}/analysis", headers=_cookie("plain-token")).status_code == 403


def test_tags_registry_and_new_account_default(api):
    """Admin → Users shows tags; a new account starts with no tags (Regression off)."""
    from app.auth.models import User
    from app.auth.permissions import effective_permissions
    from app.auth.service import totp_setup
    tags = api.get("/api/v1/admin/tags", headers=_cookie("admin-token")).json()
    assert tags == [{"key": "regression", "label": "Regression", "default": False,
                     "description": tags[0]["description"], "permissions": ["regression.view", "regression.run"]}]
    assert api.get("/api/v1/admin/tags", headers=_cookie("runner-token")).status_code == 403

    async def _signup():
        async with api.session_factory() as session:
            await totp_setup(session, "newbie@infosys.com", "New Bie")
            return (await session.execute(select(User).where(User.email == "newbie@infosys.com"))).scalars().first()
    user = asyncio.run(_signup())
    assert effective_permissions(user.role, user.permissions) == []
    assert user.is_approved is False  # self-registered → waits for an admin



def test_new_accounts_wait_for_admin_approval(api):
    from app.auth.dependencies import forget_approval
    from app.auth.models import User

    async def _set(email, **fields):
        async with api.session_factory() as session:
            u = (await session.execute(select(User).where(User.email == email))).scalars().first()
            for k, v in fields.items():
                setattr(u, k, v)
            await session.commit()
            return u.id
    pending_id = asyncio.run(_set("newcomer@infosys.com", is_approved=False, full_name="Kishor M"))
    asyncio.run(_set("kishor.m@infosys.com", full_name="Kishor M"))
    forget_approval("newcomer@infosys.com")

    # Blocked everywhere except their own auth endpoints — with an explanation.
    r = api.get(f"{BASE}/runs", headers=_cookie("pending-token"))
    assert r.status_code == 403 and "waiting for an admin to approve" in r.json()["detail"]
    me = api.get("/api/v1/auth/me", headers=_cookie("pending-token"))
    assert me.status_code == 200 and me.json()["is_approved"] is False

    # Admin sees it as pending, with a likely duplicate.
    listing = api.get("/api/v1/admin/users", headers=_cookie("admin-token")).json()
    row = next(u for u in listing["users"] if u["email"] == "newcomer@infosys.com")
    assert listing["pending"] == 1 and row["is_approved"] is False and row["possible_duplicates"] == ["kishor.m@infosys.com"]
    assert api.post(f"/api/v1/admin/users/{pending_id}/approve", headers=_cookie("runner-token")).status_code == 403

    approved = api.post(f"/api/v1/admin/users/{pending_id}/approve", headers=_cookie("admin-token")).json()
    assert approved["is_approved"] is True and approved["approved_by"] == "boss@infosys.com" and approved["approved_at"]
    assert api.get(f"{BASE}/runs", headers=_cookie("pending-token")).status_code == 200  # straight away
    assert api.get("/api/v1/auth/me", headers=_cookie("pending-token")).json()["is_approved"] is True


def test_profile_photo_upload_serve_and_remove(api):
    import base64
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), (200, 30, 30)).save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    r = api.put("/api/v1/auth/me/avatar", json={"image": data_url}, headers=_cookie("runner-token"))
    assert r.status_code == 200, r.text
    url = r.json()["avatar_url"]
    assert url.startswith("/api/v1/auth/avatar/") and "?v=" in url
    assert api.get("/api/v1/auth/me", headers=_cookie("runner-token")).json()["avatar_url"] == url

    img = api.get(url, headers=_cookie("viewer-token"))  # any signed-in user can see it
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(img.content)).size == (256, 256)  # cropped square, resized

    bad = api.put("/api/v1/auth/me/avatar", json={"image": "data:image/png;base64," + base64.b64encode(b"not an image").decode()},
                  headers=_cookie("runner-token"))
    assert bad.status_code == 422 and "isn't an image" in bad.json()["detail"]
    assert api.put("/api/v1/auth/me/avatar", json={"image": "hello"}, headers=_cookie("runner-token")).status_code == 422

    gone = api.delete("/api/v1/auth/me/avatar", headers=_cookie("runner-token"))
    assert gone.status_code == 200 and gone.json()["avatar_url"] is None
    assert api.get(url, headers=_cookie("runner-token")).status_code == 404
