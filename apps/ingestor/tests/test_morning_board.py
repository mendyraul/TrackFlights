import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from src.services import morning_board
from src.services.aeroapi_budget import AeroApiBudget


@pytest.fixture(autouse=True)
def morning_clock(monkeypatch):
    class Morning(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 4, 12, tzinfo=UTC)

    monkeypatch.setattr(morning_board, "datetime", Morning)


def test_service_day_handles_dst_and_before_four():
    assert morning_board.service_window(datetime(2026, 11, 4, 8, tzinfo=UTC)) is None
    start, end, day = morning_board.service_window(datetime(2026, 3, 7, 12, tzinfo=UTC))
    assert (end - start).total_seconds() == 23 * 3600
    start, end, day = morning_board.service_window(datetime(2026, 10, 31, 12, tzinfo=UTC))
    assert (end - start).total_seconds() == 25 * 3600


def test_five_airports_once_per_day_two_pages_each(tmp_path):
    provider = MagicMock()
    provider.budget = AeroApiBudget(str(tmp_path / "ledger.json"), 9.5, 0.02)
    provider._request_board = AsyncMock(return_value=[])
    client = MagicMock()
    asyncio.run(morning_board.collect_morning_boards(provider, client))
    asyncio.run(morning_board.collect_morning_boards(provider, client))
    assert provider._request_board.await_count == 10
    assert provider.budget.month_spend_usd == 0.1
    assert {call.args[0] for call in provider._request_board.call_args_list} == {
        "KMIA",
        "KFLL",
        "KPBI",
        "KMCO",
        "KRSW",
    }
    assert all(call.args[2]["max_pages"] == 2 for call in provider._request_board.call_args_list)


def test_failed_board_keeps_ledger_reservation(tmp_path):
    provider = MagicMock()
    provider.budget = AeroApiBudget(str(tmp_path / "ledger.json"), 9.5, 0.02)
    provider._request_board = AsyncMock(side_effect=RuntimeError("upstream down"))
    client = MagicMock()
    asyncio.run(morning_board.collect_morning_boards(provider, client))
    asyncio.run(morning_board.collect_morning_boards(provider, client))
    assert provider._request_board.await_count == 10
    client.table.assert_not_called()
