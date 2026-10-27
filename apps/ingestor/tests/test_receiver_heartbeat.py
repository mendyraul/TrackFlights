"""The receiver heartbeat must not mistake movement gating for a silent radio."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from src.providers.adsb1090_provider import MIA_LAT, MIA_LON, Adsb1090Provider
from src.services.supabase_client import SupabaseFlightClient
from src.worker.poller import Poller


def test_stationary_aircraft_still_counts_as_in_range():
    provider = Adsb1090Provider.__new__(Adsb1090Provider)
    provider.max_range_km = 200
    provider.max_seen_seconds = 60
    provider.min_move_meters = 150
    provider._last_emitted = {}
    provider._read_feed = AsyncMock(
        return_value=[{"hex": "abc", "lat": MIA_LAT, "lon": MIA_LON, "seen": 1}]
    )
    assert len(asyncio.run(provider.fetch_live_positions("MIA"))) == 1
    assert asyncio.run(provider.fetch_live_positions("MIA")) == []
    assert provider.last_snapshot_counts == (1, 1)


def test_client_records_timestamp_and_receiver_counts():
    client = SupabaseFlightClient.__new__(SupabaseFlightClient)
    client.client = Mock()
    client.record_heartbeat("adsb1090", 8, 3, 2)
    client.client.table.assert_called_once_with("ingestor_heartbeat")
    payload = client.client.table.return_value.upsert.call_args.args[0]
    assert payload["source"] == "adsb1090"
    assert payload["aircraft_received"] == 8
    assert payload["aircraft_in_range"] == 3
    assert payload["rows_written"] == 2
    assert payload["last_poll_at"]


def test_missing_heartbeat_migration_does_not_stop_ingestion():
    poller = Poller.__new__(Poller)
    poller.provider = SimpleNamespace(
        is_live_position_feed=True,
        name="adsb1090",
        fetch_live_positions=AsyncMock(return_value=[]),
        last_snapshot_counts=(0, 0),
    )
    poller.db = Mock()
    poller.db.get_current_flights.return_value = []
    poller.db.upsert_flights.return_value = 0
    poller.db.archive_completed_flights.return_value = 0
    poller.db.record_heartbeat.side_effect = RuntimeError("table missing")
    result = asyncio.run(poller._ingest_flights("MIA"))
    assert result["upserted"] == 0
    poller.db.record_heartbeat.assert_called_once_with("adsb1090", 0, 0, 0)
