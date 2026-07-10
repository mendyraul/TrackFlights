"""Tests for the FlightAware AeroAPI provider and its budget guard."""

import asyncio
import json
from datetime import UTC, datetime

from src.providers.flightaware_provider import FlightAwareProvider, _delay_minutes
from src.services.aeroapi_budget import AeroApiBudget


def _bare_provider() -> FlightAwareProvider:
    return FlightAwareProvider.__new__(FlightAwareProvider)


# ── Board extraction ─────────────────────────────────────────────


def test_extract_board_accepts_primary_key():
    flights = [{"ident": "AAL1"}]
    assert FlightAwareProvider._extract_board({"arrivals": flights}, "arrivals") == flights


def test_extract_board_accepts_scheduled_fallback_key():
    flights = [{"ident": "DAL2"}]
    assert (
        FlightAwareProvider._extract_board({"scheduled_departures": flights}, "departures")
        == flights
    )


# ── Normalization ────────────────────────────────────────────────


def test_normalize_maps_board_fields():
    provider = _bare_provider()
    result = provider.normalize(
        {
            "ident": "AAL100",
            "ident_iata": "AA100",
            "operator_iata": "AA",
            "operator": "American Airlines",
            "status": "En Route / On Time",
            "origin": {"code_iata": "JFK", "name": "John F Kennedy Intl"},
            "destination": {"code_iata": "MIA", "name": "Miami Intl"},
            "scheduled_out": "2026-07-10T10:00:00Z",
            "scheduled_in": "2026-07-10T13:00:00Z",
            "gate_destination": "D40",
            "aircraft_type": "B738",
        },
        "arrival",
    )

    assert result["flight_iata"] == "AA100"
    assert result["airline_iata"] == "AA"
    assert result["direction"] == "arrival"
    assert result["status"] == "en_route"
    assert result["origin_iata"] == "JFK"
    assert result["destination_iata"] == "MIA"
    assert result["scheduled_departure"] == "2026-07-10T10:00:00Z"
    assert result["arrival_gate"] == "D40"
    assert result["data_source"] == "flightaware"


def test_normalize_cancelled_boolean_wins():
    provider = _bare_provider()
    result = provider.normalize(
        {"ident": "NKS45", "cancelled": True, "status": "Scheduled"},
        "departure",
    )
    assert result["status"] == "cancelled"


def test_delay_fields_are_seconds():
    # AeroAPI delays are seconds: 1320s = 22 minutes.
    assert _delay_minutes({"arrival_delay": 1320}) == 22
    # Negative (early) clamps to 0.
    assert _delay_minutes({"departure_delay": -300}) == 0


def test_delay_falls_back_to_schedule_delta():
    assert (
        _delay_minutes(
            {
                "scheduled_in": "2026-07-10T13:00:00Z",
                "estimated_in": "2026-07-10T13:25:00Z",
            }
        )
        == 25
    )


# ── Budget guard ─────────────────────────────────────────────────


def test_budget_allows_until_cap(tmp_path):
    budget = AeroApiBudget(
        state_path=str(tmp_path / "budget.json"),
        monthly_budget_usd=0.05,
        cost_per_query_usd=0.02,
    )

    assert budget.allow(1)
    budget.record(1)
    assert budget.allow(1)
    budget.record(1)
    # Third query would project 0.06 > 0.05.
    assert not budget.allow(1)


def test_budget_persists_across_instances(tmp_path):
    path = str(tmp_path / "budget.json")
    first = AeroApiBudget(path, monthly_budget_usd=9.0, cost_per_query_usd=0.02)
    first.record(7)

    second = AeroApiBudget(path, monthly_budget_usd=9.0, cost_per_query_usd=0.02)
    assert second.month_queries == 7


def test_budget_rolls_over_on_new_month(tmp_path):
    path = tmp_path / "budget.json"
    path.write_text(json.dumps({"month": "1999-01", "queries": 400}))

    budget = AeroApiBudget(str(path), monthly_budget_usd=9.0, cost_per_query_usd=0.02)
    assert budget.month_queries == 0
    assert budget.allow(1)


def test_budget_snapshot_shape(tmp_path):
    budget = AeroApiBudget(
        str(tmp_path / "budget.json"), monthly_budget_usd=9.0, cost_per_query_usd=0.02
    )
    budget.record(5)
    snap = budget.snapshot()
    assert snap["aeroapi_queries_mtd"] == 5
    assert snap["aeroapi_spend_mtd_usd"] == 0.1
    assert snap["aeroapi_budget_usd"] == 9.0


# ── Fetch gating ─────────────────────────────────────────────────


def test_fetch_board_halts_when_budget_exhausted(tmp_path, monkeypatch):
    provider = _bare_provider()
    provider.base_url = "https://aeroapi.example/aeroapi"
    provider.api_key = "k"
    provider.max_pages = 1
    provider.budget = AeroApiBudget(
        str(tmp_path / "budget.json"), monthly_budget_usd=0.01, cost_per_query_usd=0.02
    )
    provider._watermarks = {}
    provider._last_scheduled_date = datetime.now(UTC).strftime("%Y-%m-%d")

    async def explode(*args, **kwargs):  # must never be called
        raise AssertionError("HTTP request issued despite exhausted budget")

    monkeypatch.setattr(provider, "_request_board", explode)

    assert asyncio.run(provider.fetch_arrivals("MIA")) == []
    assert asyncio.run(provider.fetch_departures("MIA")) == []


def test_scheduled_boards_fetch_once_per_day(tmp_path, monkeypatch):
    provider = _bare_provider()
    provider.base_url = "https://aeroapi.example/aeroapi"
    provider.api_key = "k"
    provider.max_pages = 1
    provider.budget = AeroApiBudget(
        str(tmp_path / "budget.json"), monthly_budget_usd=9.0, cost_per_query_usd=0.02
    )
    provider._watermarks = {}
    provider._last_scheduled_date = None

    boards_fetched: list[str] = []

    async def fake_request(airport, board, params):
        boards_fetched.append(board)
        return []

    monkeypatch.setattr(provider, "_request_board", fake_request)

    asyncio.run(provider.fetch_arrivals("MIA"))
    asyncio.run(provider.fetch_departures("MIA"))
    # Second cycle same day: scheduled boards must not re-fetch.
    asyncio.run(provider.fetch_arrivals("MIA"))
    asyncio.run(provider.fetch_departures("MIA"))

    assert boards_fetched.count("scheduled_arrivals") == 1
    assert boards_fetched.count("scheduled_departures") == 1
    assert boards_fetched.count("arrivals") == 2
    assert boards_fetched.count("departures") == 2


def test_watermark_windows_advance(tmp_path, monkeypatch):
    provider = _bare_provider()
    provider.base_url = "https://aeroapi.example/aeroapi"
    provider.api_key = "k"
    provider.max_pages = 1
    provider.budget = AeroApiBudget(
        str(tmp_path / "budget.json"), monthly_budget_usd=9.0, cost_per_query_usd=0.02
    )
    provider._watermarks = {}
    provider._last_scheduled_date = datetime.now(UTC).strftime("%Y-%m-%d")

    windows: list[dict] = []

    async def fake_request(airport, board, params):
        windows.append(params)
        return []

    monkeypatch.setattr(provider, "_request_board", fake_request)

    asyncio.run(provider.fetch_arrivals("MIA"))
    asyncio.run(provider.fetch_arrivals("MIA"))

    assert all("start" in w and "end" in w for w in windows)
    # Second window must start near the first window's end (15 min overlap),
    # not at the default lookback.
    assert windows[1]["start"] >= windows[0]["start"]
