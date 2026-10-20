import { supabase } from "@/lib/supabase";
import { FLIGHT_SNAPSHOT_COLUMNS } from "@/lib/dashboard-selects";
import type { ReceiverStatus } from "@/lib/freshness";

// Server refresh window. Vercel's CDN serves this response from cache and only
// re-runs the function (and the Supabase reads) about once per window per
// edge region, so Supabase egress depends on how many regions have viewers,
// not on how many viewers there are. See docs/cost-guardrails.md.
const parsedRefreshSeconds = Number(process.env.SNAPSHOT_REFRESH_SECONDS);
const REFRESH_SECONDS =
  Number.isFinite(parsedRefreshSeconds) && parsedRefreshSeconds > 0 ? parsedRefreshSeconds : 30;

// The 250 most recently *updated* rows: aircraft the receiver is hearing right
// now come first, and rows that stopped updating (landed, out of range) only
// fill whatever is left. With a 200 km range gate MIA rarely has more than
// ~150 aircraft in range at once.
const SNAPSHOT_ROW_CAP = 250;

export const dynamic = "force-dynamic";

export async function GET() {
  const [flightsResult, heartbeatResult] = await Promise.all([
    supabase
      .from("flights_current")
      .select(FLIGHT_SNAPSHOT_COLUMNS)
      .order("updated_at", { ascending: false })
      .limit(SNAPSHOT_ROW_CAP),
    // Optional until migration 20261020120000 is applied; never fails the route.
    supabase
      .from("ingestor_heartbeat")
      .select("last_poll_at,aircraft_received,aircraft_in_range")
      .eq("source", "adsb1090")
      .maybeSingle(),
  ]);

  if (flightsResult.error) {
    return Response.json(
      { flights: [], error: flightsResult.error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const flights = flightsResult.data ?? [];
  // Rows are newest-first, so the first row's updated_at is the data age the
  // UI reports. lastUpdate is only when this response was generated.
  const newest = flights[0] as { updated_at?: string } | undefined;

  const hb = heartbeatResult.error
    ? null
    : (heartbeatResult.data as {
        last_poll_at: string;
        aircraft_received: number;
        aircraft_in_range: number;
      } | null);
  const receiver: ReceiverStatus | null = hb
    ? { lastPollAt: hb.last_poll_at, received: hb.aircraft_received, inRange: hb.aircraft_in_range }
    : null;

  return Response.json(
    { flights, dataUpdatedAt: newest?.updated_at ?? null, receiver, lastUpdate: Date.now() },
    {
      status: 200,
      headers: {
        // Edge-cache the shared snapshot; serve stale briefly while revalidating.
        "Cache-Control": `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${REFRESH_SECONDS * 2}`,
      },
    }
  );
}
