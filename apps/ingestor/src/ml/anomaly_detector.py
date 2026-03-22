"""Anomaly detection for MIA flight operations.

Detects unusual patterns by comparing current metrics against
rolling baselines. Uses simple statistical rules (z-score thresholds).

Anomaly types:
  - arrival_spike / departure_spike: unusual volume
  - mass_delay: too many flights delayed at once
  - delay_distribution_shift: average delay significantly above normal
  - congestion: sustained high traffic
  - unusual_cancellations: cancellation rate spike
  - weather_impact: weather-correlated disruptions
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from supabase import Client

logger = structlog.get_logger()

MODEL_VERSION = "rules-v1"

# ── Thresholds (tunable) ────────────────────────────────────────────────

# How many standard deviations above mean triggers an anomaly
ARRIVAL_SPIKE_Z = 2.0
DEPARTURE_SPIKE_Z = 2.0

# Mass delay: if more than this fraction of active flights are delayed
MASS_DELAY_THRESHOLD = 0.30
MASS_DELAY_MIN_FLIGHTS = 5  # At least this many delayed

# Delay distribution: average delay above this triggers anomaly
AVG_DELAY_THRESHOLD_MINUTES = 25

# Cancellation spike: fraction of flights cancelled
CANCELLATION_SPIKE_THRESHOLD = 0.10
CANCELLATION_MIN_FLIGHTS = 3

# Congestion: sustained flights above this count
CONGESTION_THRESHOLD = 80  # flights in flights_current

# Weather impact: weather severity score above this + delays above normal
WEATHER_IMPACT_SEVERITY = 0.5
WEATHER_DELAY_MULTIPLIER = 1.5  # delays 1.5x baseline

# Severity mapping
SEVERITY_THRESHOLDS = {
    "low": 0.3,
    "medium": 0.5,
    "high": 0.7,
    "critical": 0.9,
}


class AnomalyDetector:
    """Detects operational anomalies from current flight and weather data."""

    def __init__(self, db: Client) -> None:
        self.db = db

    def detect(
        self,
        flights: list[dict[str, Any]],
        weather: dict[str, Any] | None = None,
        baseline: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Run all detection rules and return new anomalies.

        Args:
            flights: All current flights from flights_current.
            weather: Latest weather snapshot.
            baseline: Historical baseline stats (from analytics tables).

        Returns:
            List of anomaly records ready for DB insert.
        """
        anomalies: list[dict[str, Any]] = []

        stats = self._compute_stats(flights)

        # Load baseline if not provided
        if baseline is None:
            baseline = self._load_baseline()

        # ── Detection rules ──────────────────────────────────────────
        anomalies.extend(self._check_volume_spikes(stats, baseline))
        anomalies.extend(self._check_mass_delay(flights, stats))
        anomalies.extend(self._check_delay_distribution(stats, baseline))
        anomalies.extend(self._check_cancellation_spike(flights, stats))
        anomalies.extend(self._check_congestion(stats))
        anomalies.extend(self._check_weather_impact(stats, weather, baseline))

        if anomalies:
            logger.info(
                "Anomalies detected",
                count=len(anomalies),
                types=[a["anomaly_type"] for a in anomalies],
            )

        return anomalies

    def upsert_anomalies(self, anomalies: list[dict[str, Any]]) -> int:
        """Write anomalies to database. Returns count written."""
        if not anomalies:
            return 0

        self.db.table("traffic_anomalies").insert(anomalies).execute()
        logger.info("Anomalies stored", count=len(anomalies))
        return len(anomalies)

    def resolve_stale_anomalies(self, hours: int = 2) -> int:
        """Mark old active anomalies as resolved."""
        cutoff = (
            datetime.now(timezone.utc) - timedelta(hours=hours)
        ).isoformat()

        result = (
            self.db.table("traffic_anomalies")
            .update({"is_active": False, "resolved_at": datetime.now(timezone.utc).isoformat()})
            .eq("is_active", True)
            .lt("detected_at", cutoff)
            .execute()
        )

        count = len(result.data or [])
        if count:
            logger.info("Resolved stale anomalies", count=count)
        return count

    # ── Stats computation ────────────────────────────────────────────

    def _compute_stats(self, flights: list[dict[str, Any]]) -> dict[str, Any]:
        """Compute current operational statistics."""
        total = len(flights)
        arrivals = [f for f in flights if f.get("direction") == "arrival"]
        departures = [f for f in flights if f.get("direction") == "departure"]
        delayed = [f for f in flights if f.get("status") == "delayed"]
        cancelled = [f for f in flights if f.get("status") == "cancelled"]

        delays = [f.get("delay_minutes", 0) for f in flights if f.get("delay_minutes", 0) > 0]
        avg_delay = sum(delays) / len(delays) if delays else 0.0

        return {
            "total": total,
            "arrivals": len(arrivals),
            "departures": len(departures),
            "delayed_count": len(delayed),
            "delayed_pct": len(delayed) / total if total > 0 else 0.0,
            "cancelled_count": len(cancelled),
            "cancelled_pct": len(cancelled) / total if total > 0 else 0.0,
            "avg_delay_minutes": avg_delay,
            "max_delay_minutes": max(delays) if delays else 0,
            "delayed_flights": [f.get("flight_iata") for f in delayed],
            "cancelled_flights": [f.get("flight_iata") for f in cancelled],
        }

    def _load_baseline(self) -> dict[str, Any]:
        """Load baseline statistics from analytics_hourly (last 7 days)."""
        from datetime import datetime, timedelta, timezone

        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        result = (
            self.db.table("analytics_hourly")
            .select("*")
            .gte("hour", cutoff)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return {
                "avg_hourly_arrivals": 15.0,
                "std_hourly_arrivals": 5.0,
                "avg_hourly_departures": 15.0,
                "std_hourly_departures": 5.0,
                "avg_delay_minutes": 10.0,
            }

        arrivals = [r.get("total_flights", 0) for r in rows if r.get("direction") == "arrival"]
        departures = [r.get("total_flights", 0) for r in rows if r.get("direction") == "departure"]
        delays = [r.get("avg_delay_minutes", 0) for r in rows if r.get("avg_delay_minutes")]

        return {
            "avg_hourly_arrivals": _mean(arrivals) if arrivals else 15.0,
            "std_hourly_arrivals": _std(arrivals) if arrivals else 5.0,
            "avg_hourly_departures": _mean(departures) if departures else 15.0,
            "std_hourly_departures": _std(departures) if departures else 5.0,
            "avg_delay_minutes": _mean(delays) if delays else 10.0,
        }

    # ── Detection rules ──────────────────────────────────────────────

    def _check_volume_spikes(
        self, stats: dict, baseline: dict
    ) -> list[dict[str, Any]]:
        anomalies = []
        for direction, key, spike_z, anom_type in [
            ("arrivals", "avg_hourly_arrivals", ARRIVAL_SPIKE_Z, "arrival_spike"),
            ("departures", "avg_hourly_departures", DEPARTURE_SPIKE_Z, "departure_spike"),
        ]:
            count = stats.get(direction, 0)
            mean = baseline.get(key, 15.0)
            std = baseline.get(f"std_hourly_{direction}", 5.0)

            if std > 0 and count > mean + spike_z * std:
                deviation = (count - mean) / std
                anomalies.append(
                    self._make_anomaly(
                        anomaly_type=anom_type,
                        title=f"Unusual {direction} volume: {count} (baseline ~{mean:.0f})",
                        description=f"{count} {direction} vs baseline {mean:.0f} ± {std:.1f} ({deviation:.1f}σ)",
                        metric_name=f"hourly_{direction}",
                        metric_value=float(count),
                        baseline_value=mean,
                        deviation_pct=(count - mean) / mean * 100 if mean else 0,
                        severity_score=min(deviation / 4.0, 1.0),
                    )
                )
        return anomalies

    def _check_mass_delay(
        self, flights: list[dict], stats: dict
    ) -> list[dict[str, Any]]:
        delayed_count = stats["delayed_count"]
        delayed_pct = stats["delayed_pct"]

        if delayed_count >= MASS_DELAY_MIN_FLIGHTS and delayed_pct >= MASS_DELAY_THRESHOLD:
            airlines = {}
            for f in flights:
                if f.get("status") == "delayed":
                    al = f.get("airline_iata", "??")
                    airlines[al] = airlines.get(al, 0) + 1

            return [self._make_anomaly(
                anomaly_type="mass_delay",
                title=f"Mass delay: {delayed_count} flights ({delayed_pct:.0%})",
                description=f"{delayed_count} of {stats['total']} flights delayed. Airlines: {airlines}",
                metric_name="delayed_flight_count",
                metric_value=float(delayed_count),
                baseline_value=float(stats["total"]) * 0.15,
                deviation_pct=(delayed_pct - 0.15) / 0.15 * 100,
                severity_score=min(delayed_pct / 0.5, 1.0),
                affected_flights=stats["delayed_flights"][:20],
                affected_airlines=list(airlines.keys()),
                affected_count=delayed_count,
            )]
        return []

    def _check_delay_distribution(
        self, stats: dict, baseline: dict
    ) -> list[dict[str, Any]]:
        avg_delay = stats["avg_delay_minutes"]
        baseline_delay = baseline.get("avg_delay_minutes", 10.0)

        if avg_delay > AVG_DELAY_THRESHOLD_MINUTES and avg_delay > baseline_delay * 1.5:
            return [self._make_anomaly(
                anomaly_type="delay_distribution_shift",
                title=f"Avg delay {avg_delay:.0f}min (baseline {baseline_delay:.0f}min)",
                description=f"Average delay shifted to {avg_delay:.1f} min, {avg_delay/baseline_delay:.1f}x baseline",
                metric_name="avg_delay_minutes",
                metric_value=avg_delay,
                baseline_value=baseline_delay,
                deviation_pct=(avg_delay - baseline_delay) / baseline_delay * 100,
                severity_score=min((avg_delay - baseline_delay) / 30, 1.0),
            )]
        return []

    def _check_cancellation_spike(
        self, flights: list[dict], stats: dict
    ) -> list[dict[str, Any]]:
        if (
            stats["cancelled_count"] >= CANCELLATION_MIN_FLIGHTS
            and stats["cancelled_pct"] >= CANCELLATION_SPIKE_THRESHOLD
        ):
            return [self._make_anomaly(
                anomaly_type="unusual_cancellations",
                title=f"Cancellation spike: {stats['cancelled_count']} flights ({stats['cancelled_pct']:.0%})",
                description=f"{stats['cancelled_count']} cancellations out of {stats['total']} flights",
                metric_name="cancellation_rate",
                metric_value=stats["cancelled_pct"],
                baseline_value=0.03,
                deviation_pct=(stats["cancelled_pct"] - 0.03) / 0.03 * 100,
                severity_score=min(stats["cancelled_pct"] / 0.20, 1.0),
                affected_flights=stats["cancelled_flights"][:20],
                affected_count=stats["cancelled_count"],
            )]
        return []

    def _check_congestion(self, stats: dict) -> list[dict[str, Any]]:
        total = stats["total"]
        if total >= CONGESTION_THRESHOLD:
            return [self._make_anomaly(
                anomaly_type="congestion",
                title=f"High traffic: {total} active flights",
                description=f"{total} flights in system (threshold: {CONGESTION_THRESHOLD})",
                metric_name="total_active_flights",
                metric_value=float(total),
                baseline_value=float(CONGESTION_THRESHOLD) * 0.7,
                deviation_pct=(total - CONGESTION_THRESHOLD) / CONGESTION_THRESHOLD * 100,
                severity_score=min((total - CONGESTION_THRESHOLD) / 40, 1.0),
            )]
        return []

    def _check_weather_impact(
        self, stats: dict, weather: dict | None, baseline: dict
    ) -> list[dict[str, Any]]:
        if weather is None:
            return []

        severity = 0.0
        wind = weather.get("wind_speed_knots") or 0
        if wind > 25:
            severity += 0.3
        if weather.get("is_thunderstorm"):
            severity += 0.5
        if weather.get("is_fog"):
            severity += 0.3
        precip = weather.get("precipitation_mm") or 0
        if precip > 2:
            severity += 0.2
        severity = min(severity, 1.0)

        baseline_delay = baseline.get("avg_delay_minutes", 10.0)
        current_delay = stats["avg_delay_minutes"]

        if (
            severity >= WEATHER_IMPACT_SEVERITY
            and current_delay > baseline_delay * WEATHER_DELAY_MULTIPLIER
        ):
            desc_parts = []
            if weather.get("is_thunderstorm"):
                desc_parts.append("thunderstorm")
            if wind > 25:
                desc_parts.append(f"high winds ({wind:.0f}kts)")
            if weather.get("is_fog"):
                desc_parts.append("fog")
            if precip > 2:
                desc_parts.append(f"rain ({precip:.1f}mm)")

            return [self._make_anomaly(
                anomaly_type="weather_impact",
                title=f"Weather disruption: {', '.join(desc_parts)}",
                description=(
                    f"Weather severity {severity:.1f}/1.0 with avg delay "
                    f"{current_delay:.0f}min ({current_delay/baseline_delay:.1f}x baseline). "
                    f"Conditions: {weather.get('weather_description', 'unknown')}"
                ),
                metric_name="weather_severity",
                metric_value=severity,
                baseline_value=0.0,
                deviation_pct=severity * 100,
                severity_score=severity,
            )]
        return []

    # ── Helpers ───────────────────────────────────────────────────────

    def _make_anomaly(
        self,
        anomaly_type: str,
        title: str,
        description: str,
        metric_name: str,
        metric_value: float,
        baseline_value: float,
        deviation_pct: float,
        severity_score: float,
        affected_flights: list[str] | None = None,
        affected_airlines: list[str] | None = None,
        affected_count: int = 0,
    ) -> dict[str, Any]:
        severity = "low"
        for level, threshold in SEVERITY_THRESHOLDS.items():
            if severity_score >= threshold:
                severity = level

        return {
            "anomaly_type": anomaly_type,
            "severity": severity,
            "title": title,
            "description": description,
            "metric_name": metric_name,
            "metric_value": metric_value,
            "baseline_value": baseline_value,
            "deviation_pct": round(deviation_pct, 1),
            "affected_flights": affected_flights or [],
            "affected_airlines": affected_airlines or [],
            "affected_count": affected_count,
            "is_active": True,
            "detection_model": MODEL_VERSION,
        }


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    m = _mean(values)
    variance = sum((x - m) ** 2 for x in values) / (len(values) - 1)
    return variance ** 0.5
