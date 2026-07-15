import { supabase } from "@/lib/supabase";
import { FLIGHT_SNAPSHOT_COLUMNS } from "@/lib/dashboard-selects";

// Server refresh window. Vercel's CDN serves this response from cache and only
// re-runs the function (and the Supabase read) about once per window, so
// Supabase egress is independent of how many browsers are watching. See
// docs/cost-guardrails.md for the free-tier egress budget.
const parsedRefreshSeconds = Number(process.env.SNAPSHOT_REFRESH_SECONDS);
const REFRESH_SECONDS =
  Number.isFinite(parsedRefreshSeconds) && parsedRefreshSeconds > 0 ? parsedRefreshSeconds : 30;

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("flights_current")
    .select(FLIGHT_SNAPSHOT_COLUMNS)
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
