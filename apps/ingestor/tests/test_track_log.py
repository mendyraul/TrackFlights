"""Local track log: sampling, retention, size cap, low-disk pause, stats."""

import sqlite3
from types import SimpleNamespace

from src.services.track_log import MB, TrackLog, describe


class Clock:
    def __init__(self, t: float = 1_800_000_000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def disk(free_mb: float):
    return lambda _path: SimpleNamespace(free=free_mb * MB)


def obs(hex_id: str, **kw):
    return {"hex": hex_id, "lat": 25.8, "lon": -80.3, "alt_ft": 3000, "distance_km": 5.0, **kw}


def rows(path):
    return (
        sqlite3.connect(path).execute("SELECT hex, ts FROM positions ORDER BY ts, hex").fetchall()
    )


def test_samples_each_aircraft_at_most_once_per_interval(tmp_path):
    clock = Clock()
    log = TrackLog(str(tmp_path / "t.db"), sample_seconds=30, clock=clock, disk_usage=disk(10_000))

    assert log.record([obs("A1"), obs("B2")]) == 2
    clock.t += 15
    assert log.record([obs("A1"), obs("B2")]) == 0  # inside the 30 s window
    clock.t += 15
    assert log.record([obs("A1")]) == 1
    assert len(rows(log.path)) == 3


def test_skips_observations_without_position(tmp_path):
    log = TrackLog(str(tmp_path / "t.db"), clock=Clock(), disk_usage=disk(10_000))
    assert log.record([{"hex": "A1", "lat": None, "lon": None}, {"lat": 1, "lon": 2}]) == 0


def test_pauses_when_disk_is_low_and_resumes(tmp_path):
    free = {"mb": 500.0}
    log = TrackLog(
        str(tmp_path / "t.db"),
        min_free_mb=1024,
        clock=Clock(),
        disk_usage=lambda _p: SimpleNamespace(free=free["mb"] * MB),
    )
    assert log.record([obs("A1")]) == 0
    free["mb"] = 5000
    assert log.record([obs("A1")]) == 1


def test_retention_deletes_old_rows(tmp_path):
    clock = Clock()
    log = TrackLog(str(tmp_path / "t.db"), retention_days=2, clock=clock, disk_usage=disk(10_000))
    log.record([obs("OLD")])
    clock.t += 3 * 86400
    log.record([obs("NEW")])

    assert log.prune() == 1
    assert [h for h, _ in rows(log.path)] == ["NEW"]


def test_size_cap_drops_oldest_days_first(tmp_path):
    clock = Clock()
    log = TrackLog(
        str(tmp_path / "t.db"), sample_seconds=0, max_mb=1000, clock=clock, disk_usage=disk(10_000)
    )
    for day in range(3):
        log.record([obs(f"D{day}-{i}") for i in range(3000)])
        clock.t += 86400

    log.max_mb = log.size_mb() * 0.6  # force the cap
    log.prune()

    remaining_days = {ts for _, ts in rows(log.path)}
    assert min(remaining_days) > 1_800_000_000  # day 0 is gone
    assert log.size_mb() <= log.max_mb


def test_stats_project_growth_once_there_is_an_hour_of_data(tmp_path):
    clock = Clock()
    log = TrackLog(str(tmp_path / "t.db"), sample_seconds=0, clock=clock, disk_usage=disk(2048))
    log.record([obs("A1")])
    assert log.stats()["mb_per_day"] is None  # not enough data to project

    clock.t += 7200
    log.record([obs("A1")])
    stats = describe(sqlite3.connect(log.path), log.path, disk(2048), max_mb=500)
    assert stats["rows"] == 2
    assert stats["mb_per_day"] > 0
    assert stats["days_until_disk_full"] > 0
    assert "days_kept_at_max_mb" in stats
