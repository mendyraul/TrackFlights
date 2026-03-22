from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Flight API
    flight_api_key: str
    flight_api_base_url: str = "https://api.aviationstack.com/v1"

    # Ingestion
    poll_interval_seconds: int = 60
    mia_iata_code: str = "MIA"
    mia_icao_code: str = "KMIA"

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()  # type: ignore[call-arg]
