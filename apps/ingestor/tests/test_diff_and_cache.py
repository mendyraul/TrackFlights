"""Tests for dual-source diff semantics and the flights_current read cache."""

from src import config
from src.services.flight_diff_engine import TRACKED_FIELDS, compute_diff
from src.services.flight_normalizer import icao_callsign_to_iata
from src.services.supabase_client import CURRENT_FLIGHTS_COLUMNS, SupabaseFlightClient


def _make_client(rows: list[dict]) -> tuple[SupabaseFlightClient, dict]:
    """Build a SupabaseFlightClient with a fake supabase client recording calls."""
    counters = {"selects": 0, "upserts": 0}

    class FakeResult:
        def __init__(self, data):
            self.data = data

    class FakeTable:
        def select(self, columns):
            assert columns == CURRENT_FLIGHTS_COLUMNS
            counters["selects"] += 1
            return self

        def upsert(self, batch, on_conflict=None):
            counters["upserts"] += 1
            self._batch = batch
            return self

        def execute(self):
            return FakeResult(rows)

    class FakeClient:
        def table(self, name):
            assert name == "flights_current"
            return FakeTable()

    client = SupabaseFlightClient.__new__(SupabaseFlightClient)
    client.client = FakeClient()  # type: ignore[attr-defined]
    client._current_cache = None
    client._cache_fetched_at = 0.0
    return client, counters


def test_diff_keys_on_flight_iata_alone():
    """ADS-B rows (no schedule) must match schedule-feed rows for the same flight."""
    incoming = [{"flight_iata": "AA100", "status": "en_route", "latitude": 26.0}]
    current_db = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2026-07-10T10:00:00+00:00",
            "status": "en_route",
            "latitude": 26.0,
        }
    ]

    diff = compute_diff(incoming, current_db)
    assert len(diff.new) == 0
    assert len(diff.unchanged) == 1


def test_omitted_fields_do_not_count_as_changes():
    """A source that omits fields owned by another source must not trigger upserts."""
    incoming = [{"flight_iata": "AA100", "status": "en_route"}]
    current_db = [
        {
            "flight_iata": "AA100",
            "status": "en_route",
            "scheduled_departure": "2026-07-10T10:00:00+00:00",
            "departure_gate": "D40",
        }
    ]

    diff = compute_diff(incoming, current_db)
    assert len(diff.updated) == 0
    assert len(diff.unchanged) == 1


def test_timestamp_spelling_does_not_trigger_updates():
    incoming = [
        {
            "flight_iata": "AA100",
            "status": "scheduled",
            "scheduled_departure": "2026-07-10T10:00:00Z",
        }
    ]
    current_db = [
        {
            "flight_iata": "AA100",
            "status": "scheduled",
            "scheduled_departure": "2026-07-10T10:00:00+00:00",
        }
    ]

    diff = compute_diff(incoming, current_db)
    assert len(diff.unchanged) == 1


def test_schedule_fields_are_tracked():
    assert "scheduled_departure" in TRACKED_FIELDS
    assert "scheduled_arrival" in TRACKED_FIELDS


def test_callsign_mapping_known_carriers():
    assert icao_callsign_to_iata("AAL123") == "AA123"
    assert icao_callsign_to_iata("JBU2016") == "B62016"
    assert icao_callsign_to_iata("NKS0045") == "NK45"


def test_callsign_mapping_passthrough():
    # Unknown prefix and non-airline callsigns pass through unchanged.
    assert icao_callsign_to_iata("XXX123") == "XXX123"
    assert icao_callsign_to_iata("N425PB") == "N425PB"


def test_current_flights_cache_avoids_repeat_reads(monkeypatch):
    monkeypatch.setattr(config.settings, "current_cache_refresh_seconds", 600)
    rows = [{"flight_iata": "AA100", "status": "en_route", "id": "1"}]
    client, counters = _make_client(rows)

    first = client.get_current_flights()
    second = client.get_current_flights()

    assert counters["selects"] == 1
    assert first == second == rows


def test_cache_expires_after_refresh_window(monkeypatch):
    monkeypatch.setattr(config.settings, "current_cache_refresh_seconds", 0)
    client, counters = _make_client([{"flight_iata": "AA100", "id": "1"}])

    client.get_current_flights()
    client.get_current_flights()

    assert counters["selects"] == 2


def test_upserts_fold_into_cache(monkeypatch):
    monkeypatch.setattr(config.settings, "current_cache_refresh_seconds", 600)
    rows = [
        {
            "flight_iata": "AA100",
            "status": "scheduled",
            "departure_gate": "D40",
            "id": "1",
        }
    ]
    client, counters = _make_client(rows)
    client.get_current_flights()

    # Partial upsert (position-only, gate omitted) must merge, not replace.
    client.upsert_flights([{"flight_iata": "AA100", "status": "en_route", "latitude": 26.1}])
    cached = {row["flight_iata"]: row for row in client.get_current_flights()}

    assert counters["selects"] == 1  # served from cache
    assert cached["AA100"]["status"] == "en_route"
    assert cached["AA100"]["latitude"] == 26.1
    assert cached["AA100"]["departure_gate"] == "D40"  # preserved


def test_mark_stale_skips_rows_without_id():
    client = SupabaseFlightClient.__new__(SupabaseFlightClient)
    removed = [
        {"flight_iata": "AA100", "status": "en_route", "updated_at": "2020-01-01T00:00:00"},
    ]
    # No id -> nothing to mark; must not raise.
    assert client.mark_stale_flights(removed) == 0
