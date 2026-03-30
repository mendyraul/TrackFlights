from pydantic_settings import BaseSettings


VALID_FLIGHT_PROVIDERS = {"aviationstack", "example"}
VALID_WEATHER_PROVIDERS = {"openmeteo"}


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

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


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
        "poll_interval_seconds": settings.poll_interval_seconds,
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
        errors.append(
            f"flight_provider must be one of {sorted(VALID_FLIGHT_PROVIDERS)}"
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

    if errors:
        joined = "; ".join(errors)
        raise ValueError(f"Invalid runtime configuration: {joined}")
