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
    };
  };
}
