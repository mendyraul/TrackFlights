import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from src.services import regional_snapshot
from src.services.aeroapi_budget import AeroApiBudget


def test_daily_snapshot_charges_once_and_replaces_atomically(tmp_path, monkeypatch):
    class Noon(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 4, 12, tzinfo=UTC)

    monkeypatch.setattr(regional_snapshot, "datetime", Noon)
    provider = MagicMock()
    provider.budget = AeroApiBudget(str(tmp_path / "budget.json"), 9.5, 0.02)
    provider.base_url = "https://example.test/aeroapi"
    provider.api_key = "test"
    response = MagicMock()
    response.json.return_value = {"flights": []}
    http = AsyncMock()
    http.get.return_value = response
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=http)
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(regional_snapshot.httpx, "AsyncClient", lambda **_: context)
    client = MagicMock()
    asyncio.run(regional_snapshot.fetch_regional_snapshot(provider, client))
    asyncio.run(regional_snapshot.fetch_regional_snapshot(provider, client))
    assert http.get.await_count == 1
    assert http.get.call_args.kwargs["params"]["max_pages"] == 4
    assert provider.budget.month_spend_usd == 0.2
    client.rpc.assert_called_once_with("replace_regional_observations", {"p_rows": []})


def test_failed_requests_keep_reservation(tmp_path, monkeypatch):
    class Noon(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 4, 12, tzinfo=UTC)

    monkeypatch.setattr(regional_snapshot, "datetime", Noon)
    provider = MagicMock()
    provider.budget = AeroApiBudget(str(tmp_path / "budget.json"), 9.5, 0.02)
    provider.base_url = "https://example.test/aeroapi"
    provider.api_key = "test"
    http = AsyncMock()
    http.get.side_effect = RuntimeError("upstream unavailable")
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=http)
    context.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr(regional_snapshot.httpx, "AsyncClient", lambda **_: context)
    with pytest.raises(RuntimeError):
        asyncio.run(regional_snapshot.fetch_regional_snapshot(provider, MagicMock()))
    assert provider.budget.month_spend_usd == 0.2
