"""Tests for runtime config validation, provider factory, and DB batching."""

import pytest
from src import config, main
from src.providers.adsb1090_provider import Adsb1090Provider
from src.providers.example_provider import ExampleProvider
from src.services.supabase_client import SupabaseFlightClient


def test_validate_rejects_unknown_provider(monkeypatch):
    monkeypatch.setattr(config.settings, "flight_provider", "bogus")
    with pytest.raises(ValueError, match="flight_provider"):
        config.validate_runtime_settings()


def test_validate_adsb_requires_positive_range(monkeypatch):
    monkeypatch.setattr(config.settings, "flight_provider", "adsb1090")
    monkeypatch.setattr(config.settings, "adsb_max_range_km", 0)
    with pytest.raises(ValueError, match="adsb_max_range_km"):
        config.validate_runtime_settings()


def test_validate_passes_for_example_provider(monkeypatch):
    monkeypatch.setattr(config.settings, "flight_provider", "example")
    config.validate_runtime_settings()  # must not raise


def test_get_provider_returns_configured_instance(monkeypatch):
    monkeypatch.setattr(config.settings, "flight_provider", "example")
    assert isinstance(main.get_provider(), ExampleProvider)

    monkeypatch.setattr(config.settings, "flight_provider", "adsb1090")
    assert isinstance(main.get_provider(), Adsb1090Provider)


def test_get_provider_rejects_unknown(monkeypatch):
    monkeypatch.setattr(config.settings, "flight_provider", "nope")
    with pytest.raises(ValueError):
        main.get_provider()


def test_upsert_flights_batches_in_chunks_of_50():
    client = SupabaseFlightClient.__new__(SupabaseFlightClient)
    calls: list[tuple[int, str | None]] = []

    class FakeTable:
        def upsert(self, batch, on_conflict=None):
            calls.append((len(batch), on_conflict))
            return self

        def execute(self):
            return None

    class FakeClient:
        def table(self, name):
            assert name == "flights_current"
            return FakeTable()

    client.client = FakeClient()  # type: ignore[attr-defined]
    client._current_cache = None
    client._cache_fetched_at = 0.0
    flights = [{"flight_iata": f"AA{i}"} for i in range(120)]

    total = client.upsert_flights(flights)

    assert total == 120
    assert [n for n, _ in calls] == [50, 50, 20]
    assert all(conflict == "flight_iata" for _, conflict in calls)


def test_upsert_flights_empty_is_noop():
    client = SupabaseFlightClient.__new__(SupabaseFlightClient)
    assert client.upsert_flights([]) == 0
