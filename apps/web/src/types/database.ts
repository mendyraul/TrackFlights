export type FlightStatus =
  | "scheduled"
  | "en_route"
  | "landed"
  | "arrived"
  | "departed"
  | "cancelled"
  | "diverted"
  | "delayed"
  | "unknown";

export type FlightDirection = "arrival" | "departure";

export interface Flight {
  id: string;
  flight_iata: string;
  flight_icao: string | null;
  flight_number: string | null;
  airline_iata: string | null;
  airline_name: string | null;
  aircraft_icao: string | null;
  aircraft_registration: string | null;
  direction: FlightDirection;
  origin_iata: string | null;
  origin_name: string | null;
  destination_iata: string | null;
  destination_name: string | null;
  scheduled_departure: string | null;
  actual_departure: string | null;
  scheduled_arrival: string | null;
  actual_arrival: string | null;
  estimated_arrival: string | null;
  status: FlightStatus;
  delay_minutes: number;
  latitude: number | null;
  longitude: number | null;
  altitude_ft: number | null;
  heading: number | null;
  ground_speed_knots: number | null;
  vertical_speed_fpm: number | null;
  departure_terminal: string | null;
  departure_gate: string | null;
  arrival_terminal: string | null;
  arrival_gate: string | null;
  baggage_belt: string | null;
  updated_at: string;
}

export interface Airline {
  id: string;
  iata_code: string;
  icao_code: string | null;
  name: string;
  logo_url: string | null;
  country: string | null;
}

export interface Airport {
  id: string;
  iata_code: string;
  icao_code: string | null;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export interface AnalyticsHourly {
  id: string;
  hour: string;
  direction: FlightDirection;
  total_flights: number;
  on_time: number;
  delayed: number;
  cancelled: number;
  diverted: number;
  avg_delay_minutes: number;
  max_delay_minutes: number;
}

export interface AnalyticsDaily {
  id: string;
  date: string;
  direction: FlightDirection;
  total_flights: number;
  on_time: number;
  delayed: number;
  cancelled: number;
  diverted: number;
  avg_delay_minutes: number;
  top_delayed_airline: string | null;
  busiest_hour: number | null;
}

// ── Phase 4: Weather, Predictions, Anomalies ──────────────────────────

export interface WeatherSnapshot {
  id: string;
  airport_iata: string;
  observed_at: string;
  temperature_c: number | null;
  feels_like_c: number | null;
  wind_speed_knots: number | null;
  wind_direction_deg: number | null;
  wind_gust_knots: number | null;
  visibility_km: number | null;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
  humidity_pct: number | null;
  cloud_coverage_pct: number | null;
  weather_code: number | null;
  weather_description: string | null;
  is_thunderstorm: boolean;
  is_fog: boolean;
  is_freezing: boolean;
  pressure_hpa: number | null;
  data_source: string;
}

export type PredictionType =
  | "delay_risk"
  | "delay_minutes"
  | "on_time_probability"
  | "cancellation_risk";

export interface DelayPrediction {
  id: string;
  flight_iata: string;
  scheduled_departure: string | null;
  direction: string;
  prediction_type: PredictionType;
  predicted_value: number;
  confidence: number | null;
  factors: Record<string, number> | null;
  model_version: string;
  created_at: string;
  expires_at: string | null;
}

export type AnomalyType =
  | "arrival_spike"
  | "departure_spike"
  | "mass_delay"
  | "delay_distribution_shift"
  | "congestion"
  | "unusual_cancellations"
  | "weather_impact";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface TrafficAnomaly {
  id: string;
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string | null;
  affected_flights: string[];
  affected_airlines: string[];
  affected_count: number;
  metric_name: string | null;
  metric_value: number | null;
  baseline_value: number | null;
  deviation_pct: number | null;
  is_active: boolean;
  detected_at: string;
  resolved_at: string | null;
}

// Supabase generated types placeholder
export interface Database {
  public: {
    Tables: {
      flights_current: {
        Row: Flight;
        Insert: Partial<Flight> & { flight_iata: string; direction: FlightDirection };
        Update: Partial<Flight>;
      };
      flights_history: {
        Row: Flight & { archived_at: string };
        Insert: Partial<Flight>;
        Update: Partial<Flight>;
      };
      airlines: {
        Row: Airline;
        Insert: Partial<Airline> & { iata_code: string; name: string };
        Update: Partial<Airline>;
      };
      airports: {
        Row: Airport;
        Insert: Partial<Airport> & { iata_code: string; name: string };
        Update: Partial<Airport>;
      };
      analytics_hourly: {
        Row: AnalyticsHourly;
        Insert: Partial<AnalyticsHourly>;
        Update: Partial<AnalyticsHourly>;
      };
      analytics_daily: {
        Row: AnalyticsDaily;
        Insert: Partial<AnalyticsDaily>;
        Update: Partial<AnalyticsDaily>;
      };
      weather_snapshots: {
        Row: WeatherSnapshot;
        Insert: Partial<WeatherSnapshot>;
        Update: Partial<WeatherSnapshot>;
      };
      delay_predictions: {
        Row: DelayPrediction;
        Insert: Partial<DelayPrediction>;
        Update: Partial<DelayPrediction>;
      };
      traffic_anomalies: {
        Row: TrafficAnomaly;
        Insert: Partial<TrafficAnomaly>;
        Update: Partial<TrafficAnomaly>;
      };
    };
  };
}
