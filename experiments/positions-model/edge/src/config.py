from pathlib import Path

from pydantic_settings import BaseSettings

# Repo root is one level above src/ (this file is <repo>/src/config.py).
_PROJECT_ROOT = Path(__file__).resolve().parent.parent

VALID_FLIGHT_PROVIDERS = {"aviationstack", "example", "adsb1090"}
VALID_WEATHER_PROVIDERS = {"openmeteo"}
VALID_INGEST_MODES = {"stream", "poller"}


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Flight API
    flight_api_key: str = ""
    flight_api_base_url: str = "https://api.aviationstack.com/v1"

    # Provider: "aviationstack", "example" (mock), or "adsb1090" (self-hosted ADS-B)
    flight_provider: str = "aviationstack"

    # ADS-B (self-hosted readsb/dump1090 feed on the local Pi)
    adsb_json_url: str = "http://127.0.0.1:8080/data/aircraft.json"
    adsb_max_range_km: float = 200.0  # drop aircraft farther than this from MIA
    adsb_min_move_meters: float = 150.0  # skip writes for aircraft that barely moved
    adsb_max_seen_seconds: float = 60.0  # drop stale tracks (no recent position)

    # Ingestion
    # "stream"  = positions time-series model (tracked_flights + flight_positions),
    #             continuous read + per-aircraft throttle + batched bulk insert.
    # "poller"  = legacy diff-based flights_current model (kept for back-compat).
    ingest_mode: str = "stream"
    poll_interval_seconds: int = 10800  # legacy poller: cost-control default (every 3 hours)
    mia_iata_code: str = "MIA"
    mia_icao_code: str = "KMIA"

    # Streaming ETL (stream mode) — tuned for a Pi 3 (1GB RAM) + free-tier Supabase.
    stream_read_interval_seconds: float = 1.0  # how often to read aircraft.json
    position_throttle_seconds: float = 12.0  # min gap between captures of the SAME aircraft
    flush_interval_seconds: float = 20.0  # max time before a batch is written
    batch_max_rows: int = 500  # flush early if the buffer reaches this many rows
    positions_retention_hours: int = 12  # prune flight_positions older than this
    tracked_stale_minutes: int = 30  # drop tracked_flights not seen within this window

    # Receiver station identity + location (auto-filled from the GPS HAT when enabled).
    station_id: str = "pi-station-01"
    station_refresh_seconds: int = 300  # re-read GPS + re-register this often
    station_lat: float | None = None  # static fallback when GPS is disabled/unavailable
    station_lon: float | None = None
    station_alt_m: float | None = None

    # u-blox GPS HAT (NMEA over the Pi's GPIO serial). See scripts/setup-pi.sh.
    gps_enabled: bool = False
    gps_serial_port: str = "/dev/serial0"  # alias for /dev/ttyAMA0 or /dev/ttyS0
    gps_baud: int = 9600
    gps_read_timeout_seconds: float = 1.0

    # Weather
    weather_enabled: bool = True
    weather_provider: str = "openmeteo"
    weather_poll_interval_seconds: int = 3600  # Temporary cost-control mode: every 60 minutes

    # ML / Predictions (write-heavy; disabled by default for free-tier cost control)
    predictions_enabled: bool = False
    anomaly_detection_enabled: bool = False

    # Data retention (days)
    flights_history_retention_days: int = 7
    weather_retention_days: int = 3
    anomalies_retention_days: int = 7

    # Capacity alerting thresholds (Phase 3 Slice D1)
    capacity_cycle_lag_warn_seconds: float = 15.0
    capacity_queue_depth_warn: int = 2000
    capacity_retry_ratio_warn: float = 0.2
    capacity_fanout_p95_warn_ms: int = 1500
    capacity_churn_ratio_warn: float = 0.35

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": str(_PROJECT_ROOT / ".env"), "env_file_encoding": "utf-8"}


settings = Settings()  # type: ignore[call-arg]


def get_runtime_config_summary() -> dict[str, object]:
    """Return a sanitized runtime config payload for startup logging."""
    return {
        "flight_provider": settings.flight_provider,
        "flight_api_base_url": settings.flight_api_base_url,
        "flight_api_key_configured": bool(settings.flight_api_key),
        "airport": {
            "iata": settings.mia_iata_code,
            "icao": settings.mia_icao_code,
        },
        "ingest_mode": settings.ingest_mode,
        "poll_interval_seconds": settings.poll_interval_seconds,
        "stream": {
            "read_interval_seconds": settings.stream_read_interval_seconds,
            "position_throttle_seconds": settings.position_throttle_seconds,
            "flush_interval_seconds": settings.flush_interval_seconds,
            "batch_max_rows": settings.batch_max_rows,
        },
        "station": {
            "station_id": settings.station_id,
            "gps_enabled": settings.gps_enabled,
            "gps_serial_port": settings.gps_serial_port if settings.gps_enabled else None,
            "static_lat_lon_configured": settings.station_lat is not None
            and settings.station_lon is not None,
        },
        "weather": {
            "enabled": settings.weather_enabled,
            "provider": settings.weather_provider,
            "poll_interval_seconds": settings.weather_poll_interval_seconds,
        },
        "ml": {
            "predictions_enabled": settings.predictions_enabled,
            "anomaly_detection_enabled": settings.anomaly_detection_enabled,
        },
        "supabase": {
            "url_configured": bool(settings.supabase_url),
            "service_key_configured": bool(settings.supabase_service_role_key),
        },
    }


def validate_runtime_settings() -> None:
    """Validate critical runtime settings and fail fast on invalid config."""
    errors: list[str] = []

    if settings.flight_provider not in VALID_FLIGHT_PROVIDERS:
        errors.append(f"flight_provider must be one of {sorted(VALID_FLIGHT_PROVIDERS)}")

    if settings.ingest_mode not in VALID_INGEST_MODES:
        errors.append(f"ingest_mode must be one of {sorted(VALID_INGEST_MODES)}")

    if settings.ingest_mode == "stream":
        if settings.flight_provider != "adsb1090":
            errors.append("ingest_mode=stream requires flight_provider=adsb1090")
        if settings.position_throttle_seconds < 0:
            errors.append("position_throttle_seconds must be >= 0")
        if settings.flush_interval_seconds <= 0:
            errors.append("flush_interval_seconds must be > 0")
        if settings.batch_max_rows <= 0:
            errors.append("batch_max_rows must be > 0")
        if not settings.gps_enabled and (
            settings.station_lat is None or settings.station_lon is None
        ):
            errors.append(
                "set station_lat/station_lon (or enable gps_enabled) so positions have a station fix"
            )

    if settings.weather_enabled and settings.weather_provider not in VALID_WEATHER_PROVIDERS:
        errors.append(
            f"weather_provider must be one of {sorted(VALID_WEATHER_PROVIDERS)} when weather_enabled=true"
        )

    if settings.poll_interval_seconds <= 0:
        errors.append("poll_interval_seconds must be > 0")

    if settings.weather_enabled and settings.weather_poll_interval_seconds <= 0:
        errors.append("weather_poll_interval_seconds must be > 0 when weather_enabled=true")

    if settings.flight_provider == "aviationstack" and not settings.flight_api_key:
        errors.append("flight_api_key is required when flight_provider=aviationstack")

    if settings.flight_provider == "adsb1090":
        if not settings.adsb_json_url:
            errors.append("adsb_json_url is required when flight_provider=adsb1090")
        if settings.adsb_max_range_km <= 0:
            errors.append("adsb_max_range_km must be > 0 when flight_provider=adsb1090")

    if errors:
        joined = "; ".join(errors)
        raise ValueError(f"Invalid runtime configuration: {joined}")
