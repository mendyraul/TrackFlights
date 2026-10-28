"""Polling worker: flight ingestion, receiver telemetry, weather and retention."""

import time
from dataclasses import asdict
from datetime import UTC, datetime

import httpx
import structlog
from supabase import create_client

from src.config import settings
from src.ml.forecast_service import ForecastService
from src.ml.model_json import JsonModel
from src.ml.phase_service import PhaseClassifier
from src.providers.base_provider import BaseFlightProvider
from src.services.flight_diff_engine import compute_diff
from src.services.flight_normalizer import normalize_batch
from src.services.supabase_client import SupabaseFlightClient
from src.services.track_log import TrackLog
from src.services.traffic_stats import TrafficAccumulator
from src.worker.capacity import (
    CapacityThresholds,
    build_capacity_snapshot,
    evaluate_capacity,
)

logger = structlog.get_logger()


class Poller:
    """Runs one full ingestion cycle.

    Lifecycle per cycle:
        1. Fetch arrivals + departures from the flight provider
        2. Normalize all records to canonical schema
        3. Diff against current DB state
        4. Upsert only changed flights
        5. Mark stale flights
        6. Archive completed flights to history
        7. (Periodic) Fetch weather data
        8. Record receiver heartbeat, hourly traffic + weather, track log
        9. (Hourly) Forecast the next 6 hours, if a model is installed
        10. Log statistics
    """

    def __init__(self, provider: BaseFlightProvider) -> None:
        self.provider = provider
        self.db = SupabaseFlightClient()
        self._cycle_count = 0
        self._last_weather_time = 0.0
        self._last_successful_cycle_time = 0.0
        self._last_prune_time = 0.0
        self._traffic = TrafficAccumulator()
        # Log a missing-migration failure once, not every 15 s.
        self._telemetry_warned = False
        self._last_ping = 0.0
        self._track_log = self._open_track_log()
        self._forecast = self._load_forecast()
        self._load_phase_model()
        self._last_track_prune = 0.0

        self._weather_ingester = None
        # Latest weather this process fetched. Kept in memory: re-reading it
        # from Supabase every poll was ~5,800 egress reads a day.
        self._latest_weather: dict | None = None

        # Raw Supabase client for the weather ingester.
        self._supabase = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        self._capacity_thresholds = CapacityThresholds(
            cycle_lag_warn_seconds=settings.capacity_cycle_lag_warn_seconds,
            queue_depth_warn=settings.capacity_queue_depth_warn,
            retry_ratio_warn=settings.capacity_retry_ratio_warn,
            fanout_p95_warn_ms=settings.capacity_fanout_p95_warn_ms,
            churn_ratio_warn=settings.capacity_churn_ratio_warn,
        )

    def _get_weather_ingester(self):
        if self._weather_ingester is None:
            from src.providers.weather import OpenMeteoProvider
            from src.services.weather_ingester import WeatherIngester

            self._weather_ingester = WeatherIngester(OpenMeteoProvider(), self._supabase)
        return self._weather_ingester

    async def execute(self) -> dict[str, int]:
        """Run one full poll cycle. Returns stats dict."""
        self._cycle_count += 1
        cycle_started_at = time.time()
        airport = settings.mia_iata_code
        stats: dict[str, int] = {"cycle": self._cycle_count}

        logger.info(
            "Poll cycle starting",
            cycle=self._cycle_count,
            provider=self.provider.name,
        )
        cycle_started = time.monotonic()

        # ── 1-6. Flight ingestion ────────────────────────────────────
        flight_stats = await self._ingest_flights(airport)
        stats.update(flight_stats)

        # ── 7. Weather (periodic) ────────────────────────────────────
        if settings.weather_enabled:
            await self._maybe_ingest_weather(stats)

        # ── 8. Heartbeat, hourly traffic (with weather), track log ────
        self._record_receiver_telemetry(flight_stats)

        # ── 9. Traffic forecast (hourly, if a model is installed) ──────
        self._run_forecast()

        # Periodic pruning (once/day)
        if (time.time() - self._last_prune_time) >= 86400:
            try:
                prune_stats = self.db.prune_old_data()
                stats.update(prune_stats)
                self._last_prune_time = time.time()
            except Exception:
                logger.exception("Retention pruning failed")

        # ── 10. Log ──────────────────────────────────────────────────
        cycle_duration_seconds = time.monotonic() - cycle_started
        capacity_snapshot = build_capacity_snapshot(
            stats,
            cycle_duration_seconds=cycle_duration_seconds,
            poll_interval_seconds=settings.poll_interval_seconds,
        )
        breaches = evaluate_capacity(capacity_snapshot, self._capacity_thresholds)
        stats.update(asdict(capacity_snapshot))

        cycle_finished_at = time.time()
        cycle_duration_ms = int((cycle_finished_at - cycle_started_at) * 1000)
        seconds_since_last_success = (
            0
            if self._last_successful_cycle_time == 0
            else int(cycle_finished_at - self._last_successful_cycle_time)
        )
        self._last_successful_cycle_time = cycle_finished_at

        logger.info(
            "Poll cycle complete",
            **stats,
            cycle_duration_ms=cycle_duration_ms,
        )

        if self._cycle_count == 1 or self._cycle_count % 10 == 0:
            # Full-table status scan costs egress; only run it on heartbeats.
            db_stats = self.db.get_flight_stats()
            logger.info(
                "Ingestor runtime heartbeat",
                cycle=self._cycle_count,
                provider=self.provider.name,
                cycle_duration_ms=cycle_duration_ms,
                weather_enabled=settings.weather_enabled,
                seconds_since_last_success=seconds_since_last_success,
                db_status_counts=db_stats,
            )

        if any(breaches.values()):
            logger.warning(
                "Capacity threshold exceeded",
                breaches=[name for name, tripped in breaches.items() if tripped],
                **asdict(capacity_snapshot),
            )

        return stats

    async def _ingest_flights(self, airport: str) -> dict[str, int]:
        """Core flight ingestion pipeline."""
        self._heartbeat_recorded = False
        if self.provider.is_live_position_feed:
            # Position feeds (ADS-B) return one snapshot; direction is inferred
            # per-aircraft inside the provider's normalize().
            raw_live = await self.provider.fetch_live_positions(airport)
            raw_arrivals, raw_departures = raw_live, []
            all_normalized = normalize_batch(self.provider, raw_live, "live")
        else:
            raw_arrivals = await self.provider.fetch_arrivals(airport)
            raw_departures = await self.provider.fetch_departures(airport)
            arrivals = normalize_batch(self.provider, raw_arrivals, "arrival")
            departures = normalize_batch(self.provider, raw_departures, "departure")
            all_normalized = arrivals + departures

        logger.info(
            "Fetched raw flights",
            arrivals=len(raw_arrivals),
            departures=len(raw_departures),
        )

        current_db = self.db.get_current_flights()
        diff = compute_diff(all_normalized, current_db)

        self.db.ensure_airlines(diff.to_upsert)
        upserted = self.db.upsert_flights(diff.to_upsert)
        # Only treat rows this provider wrote as "removed" — with two ingestor
        # processes sharing flights_current, rows owned by the other data
        # source are always absent from this provider's feed.
        removed_own = [row for row in diff.removed if row.get("data_source") == self.provider.name]
        stale_marked = self.db.mark_stale_flights(removed_own) if removed_own else 0
        archived = self.db.archive_completed_flights()

        if self.provider.is_live_position_feed:
            received, in_range = getattr(
                self.provider, "last_snapshot_counts", (len(raw_arrivals), len(raw_arrivals))
            )
            try:
                self.db.record_heartbeat(self.provider.name, received, in_range, upserted)
                self._heartbeat_recorded = True
            except Exception as exc:
                # The additive heartbeat migration may not be installed yet.
                # Its absence must not stop the existing flight ingestion.
                logger.warning("Receiver heartbeat write failed", error_type=type(exc).__name__)

        for detail in diff.change_details:
            logger.debug("Flight change", flight=detail["flight_iata"], changes=detail["changes"])

        return {
            "fetched_arrivals": len(raw_arrivals),
            "fetched_departures": len(raw_departures),
            "normalized": len(all_normalized),
            "new": len(diff.new),
            "updated": len(diff.updated),
            "unchanged": len(diff.unchanged),
            "removed_from_api": len(removed_own),
            "stale_marked": stale_marked,
            "upserted": upserted,
            "archived": archived,
        }

    def _record_receiver_telemetry(self, flight_stats: dict[str, int]) -> None:
        """Heartbeat + hourly traffic for live position feeds.

        Never fails the cycle: if the 20261020 migration isn't applied yet the
        ingestor keeps working and logs one warning.
        """
        last_poll = getattr(self.provider, "last_poll", None)
        if not self.provider.is_live_position_feed or last_poll is None:
            return
        observations = last_poll["observations"]
        try:
            if not getattr(self, "_heartbeat_recorded", False):
                self.db.record_heartbeat(
                    source=self.provider.name,
                    received=last_poll["received"],
                    in_range=len(observations),
                    rows_written=flight_stats.get("upserted", 0),
                )
            hour = self._traffic.add_poll(observations, weather=self._latest_weather)
            self.db.record_traffic_hour(hour.to_rpc_params())
        except Exception:
            if not self._telemetry_warned:
                logger.exception(
                    "Receiver telemetry write failed (is migration 20261020120000 applied?)"
                )
                self._telemetry_warned = True

        self._record_track_log(observations)

        if last_poll["received"] > 0:
            self._ping_heartbeat_url()

    def _load_forecast(self) -> ForecastService | None:
        if not settings.forecast_model_path or not self.provider.is_live_position_feed:
            return None
        try:
            service = ForecastService.from_path(settings.forecast_model_path, self.db)
            logger.info(
                "Forecast model loaded",
                path=settings.forecast_model_path,
                version=service.model.version,
                heldout_mae=service.model.metrics.get("mae"),
            )
            return service
        except Exception:
            logger.exception("Forecast disabled: could not load model")
            return None

    def _load_phase_model(self) -> None:
        """Attach the learned classifier to the provider; rules stay on failure."""
        if not settings.phase_model_path or not self.provider.is_live_position_feed:
            return
        try:
            classifier = PhaseClassifier(JsonModel.load(settings.phase_model_path))
            self.provider.phase_classifier = classifier
            logger.info(
                "Phase model loaded",
                path=settings.phase_model_path,
                version=classifier.version,
                heldout_macro_f1=classifier.model.metrics.get("macro_f1"),
            )
        except Exception:
            logger.exception("Phase model disabled: could not load; using rules")

    def _run_forecast(self) -> None:
        if self._forecast is None:
            return
        forecast_weather = getattr(self._weather_ingester, "last_forecast", []) or []
        try:
            self._forecast.maybe_run(datetime.now(UTC), forecast_weather)
        except Exception:
            logger.exception("Traffic forecast failed")

    def _open_track_log(self) -> TrackLog | None:
        """Open the local position log if TRACK_LOG_PATH is set; never fatal."""
        if not settings.track_log_path or not self.provider.is_live_position_feed:
            return None
        try:
            log = TrackLog(
                settings.track_log_path,
                sample_seconds=settings.track_log_sample_seconds,
                retention_days=settings.track_log_retention_days,
                max_mb=settings.track_log_max_mb,
                min_free_mb=settings.track_log_min_free_mb,
            )
            logger.info("Track log enabled", **log.stats())
            return log
        except Exception:
            logger.exception("Track log disabled: could not open", path=settings.track_log_path)
            return None

    def _record_track_log(self, observations: list[dict]) -> None:
        if self._track_log is None:
            return
        try:
            self._track_log.record(observations)
            if time.time() - self._last_track_prune >= 3600:
                self._track_log.prune()
                self._last_track_prune = time.time()
                logger.info("Track log status", **self._track_log.stats())
        except Exception:
            logger.exception("Track log write failed")

    def _ping_heartbeat_url(self) -> None:
        """Dead-man's switch: tell an external monitor the receiver is alive."""
        url = settings.heartbeat_ping_url
        now = time.monotonic()
        if not url or now - self._last_ping < settings.heartbeat_ping_interval_seconds:
            return
        self._last_ping = now
        try:
            httpx.get(url, timeout=5.0)
        except Exception:
            logger.warning("Heartbeat ping failed", url_host=httpx.URL(url).host)

    async def _maybe_ingest_weather(self, stats: dict) -> dict | None:
        """Fetch weather if enough time has elapsed since last fetch."""
        now = time.time()
        elapsed = now - self._last_weather_time

        if elapsed < settings.weather_poll_interval_seconds and self._last_weather_time > 0:
            return self._latest_weather

        try:
            ingester = self._get_weather_ingester()
            weather = await ingester.ingest_current()
            forecast_count = await ingester.ingest_forecast(hours=12)
            self._last_weather_time = now
            self._latest_weather = weather
            stats["weather_forecast_hours"] = forecast_count
            stats["weather_updated"] = 1
            return weather
        except Exception:
            logger.exception("Weather ingestion failed")
            stats["weather_error"] = 1
            return None
