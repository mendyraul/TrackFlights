"""Tests for the streaming ETL: throttle/batch buffer + flush mapping."""

from src import config
from src.worker.position_streamer import (
    PositionBuffer,
    PositionStreamer,
    to_position_row,
    to_tracked_row,
)


def _sample(hex_id="A1B2C3", lat=25.9, lon=-80.3):
    return {
        "hex": hex_id,
        "callsign": "AAL100",
        "registration": "N123AA",
        "aircraft_type": "B738",
        "latitude": lat,
        "longitude": lon,
        "altitude_ft": 4000,
        "ground_speed_knots": 240,
        "track_deg": 270,
        "vertical_rate_fpm": -1200,
        "on_ground": False,
    }


class FakeDB:
    def __init__(self):
        self.positions = []
        self.tracked = []
        self.stations = []

    def insert_positions(self, rows):
        self.positions.extend(rows)
        return len(rows)

    def upsert_tracked(self, rows):
        self.tracked.extend(rows)
        return len(rows)

    def upsert_station(self, station):
        self.stations.append(station)


class FakeLocator:
    def __init__(self, station):
        self._station = station

    def get_station(self, force=False):
        return self._station


def test_buffer_throttles_same_aircraft():
    buf = PositionBuffer(throttle_seconds=12.0, max_rows=100)
    assert buf.offer(_sample(), now=0.0) is True
    # Same hex 5s later — within the throttle window, dropped.
    assert buf.offer(_sample(), now=5.0) is False
    # 13s later — past the window, kept.
    assert buf.offer(_sample(), now=13.0) is True
    assert buf.size == 2


def test_buffer_tracks_aircraft_independently():
    buf = PositionBuffer(throttle_seconds=12.0, max_rows=100)
    assert buf.offer(_sample("AAA111"), now=0.0) is True
    assert buf.offer(_sample("BBB222"), now=0.0) is True
    assert buf.offer(_sample("AAA111"), now=1.0) is False
    assert buf.size == 2


def test_buffer_full_and_drain():
    buf = PositionBuffer(throttle_seconds=0.0, max_rows=2)
    buf.offer(_sample("AAA111"), now=0.0)
    assert buf.is_full() is False
    buf.offer(_sample("BBB222"), now=0.0)
    assert buf.is_full() is True
    drained = buf.drain()
    assert len(drained) == 2
    assert buf.size == 0


def test_buffer_forget_stale_bounds_memory():
    buf = PositionBuffer(throttle_seconds=12.0, max_rows=100)
    buf.offer(_sample("OLD000"), now=0.0)
    buf.drain()
    # Far in the future, the throttle entry for OLD000 should be forgotten.
    buf.forget_stale(now=1000.0)
    # A fresh offer for the same hex is accepted immediately (no stale throttle).
    assert buf.offer(_sample("OLD000"), now=1000.0) is True


def test_tracked_row_omits_first_seen():
    row = to_tracked_row(_sample(), station_id="s1", last_seen="2026-01-01T00:00:00Z")
    assert "first_seen" not in row  # DB sets it once on insert; upserts must not clobber
    assert row["hex"] == "A1B2C3"
    assert row["last_seen"] == row["updated_at"] == "2026-01-01T00:00:00Z"
    assert row["station_id"] == "s1"


def test_position_row_shape():
    row = to_position_row(_sample(), station_id="s1", recorded_at="2026-01-01T00:00:00Z")
    assert set(row) == {
        "hex",
        "latitude",
        "longitude",
        "altitude_ft",
        "ground_speed_knots",
        "track_deg",
        "vertical_rate_fpm",
        "recorded_at",
        "station_id",
    }


def test_flush_writes_positions_and_dedupes_tracked(monkeypatch):
    monkeypatch.setattr(config.settings, "position_throttle_seconds", 0.0)
    monkeypatch.setattr(config.settings, "batch_max_rows", 1000)
    db = FakeDB()
    streamer = PositionStreamer(provider=object(), db=db, locator=FakeLocator(None))
    streamer._station_id = "s1"

    # Two samples for the same hex + one for another → 3 positions, 2 tracked.
    streamer._buffer.offer(_sample("AAA111", lat=1.0), now=0.0)
    streamer._buffer.offer(_sample("AAA111", lat=2.0), now=0.0)
    streamer._buffer.offer(_sample("BBB222"), now=0.0)

    written = streamer.flush()
    assert written == 3
    assert len(db.positions) == 3
    assert len(db.tracked) == 2  # deduped by hex
    # Last sample per hex wins for the tracked latest-state row.
    aaa = next(r for r in db.tracked if r["hex"] == "AAA111")
    assert aaa["latitude"] == 2.0


def test_flush_noop_when_empty():
    db = FakeDB()
    streamer = PositionStreamer(provider=object(), db=db, locator=FakeLocator(None))
    assert streamer.flush() == 0
    assert db.positions == []


def test_register_station_upserts_and_sets_id():
    db = FakeDB()
    station = {
        "station_id": "pi-xyz",
        "latitude": 25.0,
        "longitude": -80.0,
        "altitude_m": 3.0,
        "source": "gps",
        "last_updated": "2026-01-01T00:00:00Z",
    }
    streamer = PositionStreamer(provider=object(), db=db, locator=FakeLocator(station))
    streamer.register_station()
    assert streamer._station_id == "pi-xyz"
    assert len(db.stations) == 1
    assert "source" not in db.stations[0]  # the transient 'source' field is stripped
