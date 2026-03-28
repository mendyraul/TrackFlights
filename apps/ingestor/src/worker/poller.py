"""Polling worker — orchestrates flight ingestion, weather, predictions, and anomaly detection."""

import time

import structlog
from supabase import create_client

from src.config import settings
from src.providers.base_provider import BaseFlightProvider
from src.services.supabase_client import SupabaseFlightClient
from src.services.flight_normalizer import normalize_batch
from src.services.flight_diff_engine import compute_diff

logger = structlog.get_logger()


class Poller:
    """Runs the full ingestion cycle including ML services.

    Lifecycle per cycle:
        1. Fetch arrivals + departures from the flight provider
        2. Normalize all records to canonical schema
        3. Diff against current DB state
        4. Upsert only changed flights
        5. Mark stale flights
        6. Archive completed flights to history
        7. (Periodic) Fetch weather data
        8. (If enabled) Run delay predictions
        9. (If enabled) Run anomaly detection
        10. Log statistics
    """

    def __init__(self, provider: BaseFlightProvider) -> None:
        self.provider = provider
        self.db = SupabaseFlightClient()
        self._cycle_count = 0
        self._last_weather_time = 0.0
        self._last_successful_cycle_time = 0.0

        # Lazy-init ML services (only if enabled)
        self._weather_ingester = None
        self._delay_predictor = None
        self._anomaly_detector = None

        # Get a raw supabase client for ML services
        self._supabase = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

    def _get_weather_ingester(self):
        if self._weather_ingester is None:
            from src.providers.weather import OpenMeteoProvider
            from src.services.weather_ingester import WeatherIngester
            self._weather_ingester = WeatherIngester(
                OpenMeteoProvider(), self._supabase
            )
        return self._weather_ingester

    def _get_delay_predictor(self):
        if self._delay_predictor is None:
            from src.ml.delay_predictor import DelayPredictor
            self._delay_predictor = DelayPredictor(self._supabase)
        return self._delay_predictor

    def _get_anomaly_detector(self):
        if self._anomaly_detector is None:
            from src.ml.anomaly_detector import AnomalyDetector
            self._anomaly_detector = AnomalyDetector(self._supabase)
        return self._anomaly_detector

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

        # ── 1-6. Flight ingestion ────────────────────────────────────
        flight_stats = await self._ingest_flights(airport)
        stats.update(flight_stats)

        # Get current flights for ML services
        current_flights = self.db.get_current_flights()

        # ── 7. Weather (periodic) ────────────────────────────────────
        weather_data = None
        if settings.weather_enabled:
            weather_data = await self._maybe_ingest_weather(stats)

        # ── 8. Predictions ───────────────────────────────────────────
        if settings.predictions_enabled:
            self._run_predictions(current_flights, weather_data, stats)

        # ── 9. Anomaly detection ─────────────────────────────────────
        if settings.anomaly_detection_enabled:
            self._run_anomaly_detection(current_flights, weather_data, stats)

        # ── 10. Log ──────────────────────────────────────────────────
        db_stats = self.db.get_flight_stats()
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
            db_status_counts=db_stats,
            cycle_duration_ms=cycle_duration_ms,
        )

        if self._cycle_count == 1 or self._cycle_count % 10 == 0:
            logger.info(
                "Ingestor runtime heartbeat",
                cycle=self._cycle_count,
                provider=self.provider.name,
                cycle_duration_ms=cycle_duration_ms,
                weather_enabled=settings.weather_enabled,
                predictions_enabled=settings.predictions_enabled,
                anomaly_detection_enabled=settings.anomaly_detection_enabled,
                seconds_since_last_success=seconds_since_last_success,
            )

        return stats

    async def _ingest_flights(self, airport: str) -> dict[str, int]:
        """Core flight ingestion pipeline."""
        raw_arrivals = await self.provider.fetch_arrivals(airport)
        raw_departures = await self.provider.fetch_departures(airport)

        logger.info(
            "Fetched raw flights",
            arrivals=len(raw_arrivals),
            departures=len(raw_departures),
        )

        arrivals = normalize_batch(self.provider, raw_arrivals, "arrival")
        departures = normalize_batch(self.provider, raw_departures, "departure")
        all_normalized = arrivals + departures

        current_db = self.db.get_current_flights()
        diff = compute_diff(all_normalized, current_db)

        upserted = self.db.upsert_flights(diff.to_upsert)
        stale_marked = self.db.mark_stale_flights(diff.removed) if diff.removed else 0
        archived = self.db.archive_completed_flights()

        for detail in diff.change_details:
            logger.debug("Flight change", flight=detail["flight_iata"], changes=detail["changes"])

        return {
            "fetched_arrivals": len(raw_arrivals),
            "fetched_departures": len(raw_departures),
            "normalized": len(all_normalized),
            "new": len(diff.new),
            "updated": len(diff.updated),
            "unchanged": len(diff.unchanged),
            "removed_from_api": len(diff.removed),
            "stale_marked": stale_marked,
            "upserted": upserted,
            "archived": archived,
        }

    async def _maybe_ingest_weather(self, stats: dict) -> dict | None:
        """Fetch weather if enough time has elapsed since last fetch."""
        now = time.time()
        elapsed = now - self._last_weather_time

        if elapsed < settings.weather_poll_interval_seconds and self._last_weather_time > 0:
            # Return cached latest
            ingester = self._get_weather_ingester()
            return ingester.get_latest()

        try:
            ingester = self._get_weather_ingester()
            weather = await ingester.ingest_current()
            forecast_count = await ingester.ingest_forecast(hours=12)
            self._last_weather_time = now
            stats["weather_forecast_hours"] = forecast_count
            stats["weather_updated"] = 1
            return weather
        except Exception:
            logger.exception("Weather ingestion failed")
            stats["weather_error"] = 1
            return None

    def _run_predictions(
        self,
        flights: list[dict],
        weather: dict | None,
        stats: dict,
    ) -> None:
        """Generate and store delay predictions."""
        try:
            predictor = self._get_delay_predictor()

            # Only predict for upcoming flights (not landed/cancelled)
            active_flights = [
                f for f in flights
                if f.get("status") in ("scheduled", "en_route", "delayed")
            ]

            if not active_flights:
                return

            traffic_stats = {
                "total_active": len(flights),
                "delayed_pct": (
                    len([f for f in flights if f.get("status") == "delayed"])
                    / len(flights) if flights else 0.0
                ),
            }

            predictions = predictor.predict_batch(active_flights, weather, traffic_stats)
            count = predictor.upsert_predictions(predictions)
            expired = predictor.cleanup_expired()

            stats["predictions_generated"] = count
            stats["predictions_expired_cleaned"] = expired

        except Exception:
            logger.exception("Prediction generation failed")
            stats["predictions_error"] = 1

    def _run_anomaly_detection(
        self,
        flights: list[dict],
        weather: dict | None,
        stats: dict,
    ) -> None:
        """Run anomaly detection and store results."""
        try:
            detector = self._get_anomaly_detector()

            anomalies = detector.detect(flights, weather)
            count = detector.upsert_anomalies(anomalies)
            resolved = detector.resolve_stale_anomalies()

            stats["anomalies_detected"] = count
            stats["anomalies_resolved"] = resolved

        except Exception:
            logger.exception("Anomaly detection failed")
            stats["anomaly_error"] = 1
