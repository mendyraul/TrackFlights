import { supabase } from "@/lib/supabase";

// Same projection the client used to query directly. Kept here so the only
// Supabase read happens server-side and is shared across all viewers.
const FLIGHT_COLUMNS =
  "id,flight_iata,airline_iata,departure_airport_iata,arrival_airport_iata,scheduled_departure,scheduled_arrival,estimated_departure,estimated_arrival,actual_departure,actual_arrival,status,terminal,gate,baggage_claim,delay_minutes,latitude,longitude,altitude_ft,speed_knots,heading,updated_at";

// Server refresh window. Vercel's CDN serves this response from cache and only
// re-runs the function (and the Supabase read) about once per window, so
// Supabase egress is independent of how many browsers are watching. See
// docs/cost-guardrails.md for the free-tier egress budget.
const REFRESH_SECONDS = Number(process.env.SNAPSHOT_REFRESH_SECONDS ?? 30);

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("flights_current")
    .select(FLIGHT_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    return Response.json(
      { flights: [], error: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    { flights: data ?? [], lastUpdate: Date.now() },
    {
      status: 200,
      headers: {
        // Edge-cache the shared snapshot; serve stale briefly while revalidating.
        "Cache-Control": `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${REFRESH_SECONDS * 2}`,
      },
    }
  );
}
