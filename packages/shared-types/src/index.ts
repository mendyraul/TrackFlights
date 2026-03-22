// Shared type definitions for MIA Flight Tracker
// Used by both the Next.js frontend and referenced in Python models

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

export interface FlightPosition {
  latitude: number;
  longitude: number;
  altitude_ft: number | null;
  heading: number | null;
  ground_speed_knots: number | null;
  vertical_speed_fpm: number | null;
}

export interface FlightIdentifiers {
  flight_iata: string;
  flight_icao: string | null;
  flight_number: string | null;
  airline_iata: string | null;
  airline_name: string | null;
}

export interface FlightSchedule {
  scheduled_departure: string | null;
  actual_departure: string | null;
  scheduled_arrival: string | null;
  actual_arrival: string | null;
  estimated_arrival: string | null;
  delay_minutes: number;
}

export interface FlightGateInfo {
  departure_terminal: string | null;
  departure_gate: string | null;
  arrival_terminal: string | null;
  arrival_gate: string | null;
  baggage_belt: string | null;
}

export interface Flight
  extends FlightIdentifiers,
    FlightSchedule,
    FlightGateInfo {
  id: string;
  direction: FlightDirection;
  status: FlightStatus;
  aircraft_icao: string | null;
  aircraft_registration: string | null;
  origin_iata: string | null;
  origin_name: string | null;
  destination_iata: string | null;
  destination_name: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude_ft: number | null;
  heading: number | null;
  ground_speed_knots: number | null;
  vertical_speed_fpm: number | null;
  updated_at: string;
}

// MIA coordinates
export const MIA_COORDINATES = {
  latitude: 25.7959,
  longitude: -80.287,
} as const;
