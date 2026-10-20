"""Per-hour traffic accumulator for the ADS-B feed.

Each poll sees every in-range aircraft (before the movement gate drops the
ones that barely moved). This folds those polls into one record per UTC
hour: unique aircraft by ICAO hex, how many were arriving/departing/
overflying/on the ground, the most seen at once, and the farthest one. The
poller writes the record through record_traffic_hour() every poll, so the
hour is always current in the database and survives restarts (the SQL merge
keeps the larger value).
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from src.services.phase import Phase


@dataclass
class HourlyTraffic:
    hour: datetime
    # Latest phase per aircraft this hour. An aircraft counts once per hour,
    # in the phase it was last seen in.
    phases: dict[str, Phase] = field(default_factory=dict)
    peak_concurrent: int = 0
    max_range_km: float | None = None
    polls: int = 0
    # Most recent weather seen during the hour (forecast-model features).
    weather: dict[str, Any] | None = None

    def add_poll(
        self, observations: list[dict[str, Any]], weather: dict[str, Any] | None = None
    ) -> None:
        self.polls += 1
        if weather:
            self.weather = weather
        self.peak_concurrent = max(self.peak_concurrent, len(observations))
        for obs in observations:
            self.phases[obs["hex"]] = obs["phase"]
            distance = obs.get("distance_km")
            if distance is not None and (self.max_range_km is None or distance > self.max_range_km):
                self.max_range_km = distance

    def to_rpc_params(self) -> dict[str, Any]:
        counts = {"arriving": 0, "departing": 0, "overflight": 0, "on-ground": 0}
        for phase in self.phases.values():
            # Traffic to/from other fields isn't MIA traffic: count it with
            # overflights so the phase buckets still add up to unique_aircraft.
            phase = "overflight" if phase == "other-airport" else phase
            if phase in counts:
                counts[phase] += 1
        return {
            "p_hour": self.hour.isoformat(),
            "p_unique_aircraft": len(self.phases),
            "p_arriving": counts["arriving"],
            "p_departing": counts["departing"],
            "p_overflights": counts["overflight"],
            "p_on_ground": counts["on-ground"],
            "p_peak_concurrent": self.peak_concurrent,
            "p_max_range_km": (
                round(self.max_range_km, 1) if self.max_range_km is not None else None
            ),
            "p_polls": self.polls,
            **_weather_params(self.weather),
        }


def _weather_params(w: dict[str, Any] | None) -> dict[str, Any]:
    w = w or {}
    return {
        "p_temp_c": w.get("temperature_c"),
        "p_wind_kt": w.get("wind_speed_knots"),
        "p_gust_kt": w.get("wind_gust_knots"),
        "p_precip_mm": w.get("precipitation_mm"),
        "p_visibility_km": w.get("visibility_km"),
        "p_is_thunderstorm": w.get("is_thunderstorm"),
    }


def current_hour(now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    return now.replace(minute=0, second=0, microsecond=0)


class TrafficAccumulator:
    """Holds the current hour; starts a fresh record when the hour rolls over."""

    def __init__(self) -> None:
        self.current: HourlyTraffic | None = None

    def add_poll(
        self,
        observations: list[dict[str, Any]],
        now: datetime | None = None,
        weather: dict[str, Any] | None = None,
    ) -> HourlyTraffic:
        hour = current_hour(now)
        if self.current is None or self.current.hour != hour:
            self.current = HourlyTraffic(hour=hour)
        self.current.add_poll(observations, weather)
        return self.current
