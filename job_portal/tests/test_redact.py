"""
Author: Kishore Kumar
Tests for app/core/redact.py — no internal addresses or secrets in text the UI shows.
"""

from __future__ import annotations

import httpx

from app.core.redact import mask_secrets, public_error


def test_mask_secrets_hides_credentials_only():
    assert mask_secrets("amqp://guest:s3cret@10.0.0.5:5672/vh") == "amqp://***@10.0.0.5:5672/vh"
    assert mask_secrets("GET https://h/x?a=1&token=abc123&api_key=k9 ok") == "GET https://h/x?a=1&token=***&api_key=*** ok"
    assert mask_secrets("Fetching 19 reports...") == "Fetching 19 reports..."


def test_public_error_hides_addresses():
    jira = "Server error '500 Internal Server Error' for url 'http://oboinspector-ui-staging-lgi.obo.libgbl-lab.biz/jira/searchJql'"
    assert public_error(jira) == "Server error '500 Internal Server Error' for url '(internal address)'"
    assert "s3cret" not in public_error(Exception("connect amqp://u:s3cret@172.23.87.170:5672/e2e failed"))
    assert public_error(httpx.ConnectTimeout("")) == "ConnectTimeout"  # empty text → the error's kind


def test_meta_no_longer_returns_the_base_url():
    import asyncio
    from unittest.mock import AsyncMock, patch
    from app.services import inspectorweb_regression as iw
    with patch.object(iw, "_get_json", AsyncMock(return_value={})):
        iw._cache.clear()
        meta = asyncio.run(iw.get_meta())
    assert "baseUrl" not in meta


def test_admin_config_masks_every_secret():
    from app.routers.admin import _display_value
    assert _display_value("ANTHROPIC_API_KEY", "sk-ant-abc") == "*** (set)"
    assert _display_value("ANTHROPIC_API_KEY", "") == "(not set)"
    assert _display_value("JWT_SECRET_KEY", "x") == "*** (set)"
    assert _display_value("RABBITMQ_URL", "amqp://u:p@h/v") == "*** (set)"
    assert _display_value("ODH_URL", "http://u:p@es:9200") == "http://***@es:9200"
    assert _display_value("ACCESS_TOKEN_EXPIRE_MINUTES", 15) == "15"  # not a secret
