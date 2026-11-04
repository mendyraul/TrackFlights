import type { Flight } from "@/types/database";
export const BOARD_AIRPORTS = ["MIA", "FLL", "PBI", "MCO", "RSW"];
export interface AirportBaseline {
  airport: string;
  service_date: string;
  board: string;
  fetched_at: string;
  partial: boolean;
  page_limit: number;
  flights: (Flight & { details?: Record<string, unknown> })[];
}
export interface AirportProgress {
  airport: string;
  service_date: string;
  board: string;
  flight_key: string;
  state: string;
  observed_at: string;
  evidence: { latitude?: number; longitude?: number; source?: string };
}
export interface AirportBoardResponse {
  supported: boolean;
  baselines: AirportBaseline[];
  progress: AirportProgress[];
}
