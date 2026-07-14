import { supabase } from "@/lib/supabase";
import type { Flight } from "@/types/database";

// Latest state lives in tracked_flights (one row per aircraft). We read it once
// per refresh window, server-side, and adapt each row to the Flight shape the UI
// already consumes — so the map/table components are unchanged. The only Supabase
// read happens here and is shared across all viewers via the CDN cache below.
const TRACKED_COLUMNS =
  "hex,callsign,registration,aircraft_type,origin,destination,latitude,longitude,altitude_ft,ground_speed_knots,track_deg,vertical_rate_fpm,on_ground,last_seen";

// Server refresh window. Vercel's CDN serves this response from cache and only
// re-runs the function (and the Supabase read) about once per window, so Supabase
// egress is independent of how many browsers are watching.
const REFRESH_SECONDS = Number(process.env.SNAPSHOT_REFRESH_SECONDS ?? 30);

interface TrackedRow {
  hex: string;
  callsign: string | null;
  registration: string | null;
  aircraft_type: string | null;
  origin: string | null;
  destination: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude_ft: number | null;
  ground_speed_knots: number | null;
  track_deg: number | null;
  vertical_rate_fpm: number | null;
  on_ground: boolean | null;
  last_seen: string;
}

// Adapt a tracked_flights row to the Flight shape the UI renders. Fields that the
// ADS-B positions model doesn't carry (airline, schedule, gate, ...) are null and
// the components already render them as blank/`---`.
function toFlight(row: TrackedRow): Flight {
  const vr = row.vertical_rate_fpm;
  return {
    id: row.hex,
    flight_iata: row.callsign ?? row.hex,
    flight_icao: row.callsign,
    flight_number: row.callsign,
    airline_iata: null,
    airline_name: null,
    aircraft_icao: row.aircraft_type,
    aircraft_registration: row.registration,
    direction: typeof vr === "number" && vr < -64 ? "arrival" : "departure",
    origin_iata: row.origin,
    origin_name: null,
    destination_iata: row.destination,
    destination_name: null,
    scheduled_departure: null,
    actual_departure: null,
    scheduled_arrival: null,
    actual_arrival: null,
    estimated_arrival: null,
    status: row.on_ground ? "landed" : "en_route",
    delay_minutes: 0,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude_ft: row.altitude_ft,
    heading: row.track_deg,
    ground_speed_knots: row.ground_speed_knots,
    vertical_speed_fpm: row.vertical_rate_fpm,
    departure_terminal: null,
    departure_gate: null,
    arrival_terminal: null,
    arrival_gate: null,
    baggage_belt: null,
    updated_at: row.last_seen,
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("tracked_flights")
    .select(TRACKED_COLUMNS)
    .order("last_seen", { ascending: false })
    .limit(250);

  if (error) {
    return Response.json(
      { flights: [], error: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const flights = ((data ?? []) as unknown as TrackedRow[]).map(toFlight);

  return Response.json(
    { flights, lastUpdate: Date.now() },
    {
      status: 200,
      headers: {
        // Edge-cache the shared snapshot; serve stale briefly while revalidating.
        "Cache-Control": `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${REFRESH_SECONDS * 2}`,
      },
    }
  );
}
