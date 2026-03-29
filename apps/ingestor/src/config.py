from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Flight API
    flight_api_key: str = ""
    flight_api_base_url: str = "https://api.aviationstack.com/v1"

    # Provider: "aviationstack" or "example" (mock data for dev)
    flight_provider: str = "aviationstack"

    # Ingestion
    poll_interval_seconds: int = 60
    mia_iata_code: str = "MIA"
    mia_icao_code: str = "KMIA"

    # Weather
    weather_enabled: bool = True
    weather_provider: str = "openmeteo"
    weather_poll_interval_seconds: int = 300  # Every 5 minutes

    # ML / Predictions
    predictions_enabled: bool = True
    anomaly_detection_enabled: bool = True

    # Capacity alerting thresholds (Phase 3 Slice D1)
    capacity_cycle_lag_warn_seconds: float = 15.0
    capacity_queue_depth_warn: int = 2000
    capacity_retry_ratio_warn: float = 0.2
    capacity_fanout_p95_warn_ms: int = 1500
    capacity_churn_ratio_warn: float = 0.35

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()  # type: ignore[call-arg]
