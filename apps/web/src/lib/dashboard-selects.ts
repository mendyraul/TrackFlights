// Keep these projections aligned with `supabase/migrations/**` and
// `src/types/database.ts`. The dashboard is stringly typed at the query layer,
// so a stale column here can silently blank whole sections of the page.
// Only what the UI reads. Every column here is paid for twice: once as
// Supabase egress per CDN refresh and once per browser poll. Airline name,
// direction, delay, gates, terminals and baggage are either derived in the
// browser from ADS-B fields or never filled by the ADS-B feed, so they are
// not selected (about 40% of the raw payload was nulls for those columns).
export const FLIGHT_SNAPSHOT_COLUMNS = [
  "id",
  "flight_iata",
  "flight_icao",
  "aircraft_icao",
  "aircraft_registration",
  "status",
  "latitude",
  "longitude",
  "altitude_ft",
  "heading",
  "ground_speed_knots",
  "vertical_speed_fpm",
  // Schedule fields: only the optional AeroAPI feed fills these.
  "origin_iata",
  "destination_iata",
  "scheduled_departure",
  "actual_departure",
  "scheduled_arrival",
  "actual_arrival",
  "estimated_arrival",
  "updated_at",
  // ADS-B ICAO 24-bit address. Not a column: the ingestor keeps it in
  // raw_data, so project it out under a stable name.
  "icao_hex:raw_data->>hex",
].join(",");

export const ANALYTICS_HOURLY_COLUMNS = [
  "id",
  "hour",
  "direction",
  "total_flights",
  "on_time",
  "delayed",
  "cancelled",
  "diverted",
  "avg_delay_minutes",
  "max_delay_minutes",
].join(",");

export const ANALYTICS_DAILY_COLUMNS = [
  "id",
  "date",
  "direction",
  "total_flights",
  "on_time",
  "delayed",
  "cancelled",
  "diverted",
  "avg_delay_minutes",
  "max_delay_minutes",
  "top_delayed_airline",
  "busiest_hour",
].join(",");

export const WEATHER_COLUMNS = [
  "id",
  "airport_iata",
  "observed_at",
  "temperature_c",
  "feels_like_c",
  "humidity_pct",
  "pressure_hpa",
  "wind_speed_knots",
  "wind_gust_knots",
  "wind_direction_deg",
  "visibility_km",
  "cloud_coverage_pct",
  "weather_code",
  "weather_description",
  "is_thunderstorm",
  "is_fog",
  "is_freezing",
  "precipitation_mm",
  "precipitation_probability",
  "data_source",
].join(",");

export const ANOMALY_COLUMNS = [
  "id",
  "anomaly_type",
  "severity",
  "title",
  "description",
  "metric_name",
  "metric_value",
  "baseline_value",
  "deviation_pct",
  "affected_flights",
  "affected_airlines",
  "affected_count",
  "is_active",
  "detected_at",
  "resolved_at",
  "detection_model",
].join(",");

export const PREDICTION_COLUMNS = [
  "id",
  "flight_iata",
  "scheduled_departure",
  "direction",
  "prediction_type",
  "predicted_value",
  "confidence",
  "factors",
  "model_version",
  "created_at",
  "expires_at",
].join(",");

export const TRAFFIC_HOURLY_COLUMNS = [
  "hour",
  "unique_aircraft",
  "arriving",
  "departing",
  "overflights",
  "on_ground",
  "peak_concurrent",
  "max_range_km",
].join(",");
