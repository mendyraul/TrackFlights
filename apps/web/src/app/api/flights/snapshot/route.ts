import { readObservations, readSchedules } from "@/lib/source-observations";
import { supabase } from "@/lib/supabase";
import { FLIGHT_SNAPSHOT_COLUMNS } from "@/lib/dashboard-selects";
import { readReceiver } from "@/lib/receiver";
import { withinDeadline } from "@/lib/health";

// Server refresh window. Vercel's CDN serves this response from cache and only
// re-runs the function (and the Supabase read) about once per window, so
// Supabase egress is independent of how many browsers are watching. See
// docs/cost-guardrails.md for the free-tier egress budget.
const parsedRefreshSeconds = Number(process.env.SNAPSHOT_REFRESH_SECONDS);
const REFRESH_SECONDS =
  Number.isFinite(parsedRefreshSeconds) && parsedRefreshSeconds > 0 ? parsedRefreshSeconds : 30;

export const dynamic = "force-dynamic";

async function snapshot() {
  const [result, receiver, observations, boardSchedules] = await Promise.all([
    withinDeadline((signal) =>
      supabase
        .from("flights_current")
        .select(FLIGHT_SNAPSHOT_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(250)
        .abortSignal(signal)
    ),
    readReceiver(),
    readObservations(),
    readSchedules(),
  ]);
  const { data, error } = result;

  if (error) {
    return Response.json(
      { flights: [], error: "Flight data unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const legacy = (data ?? []) as unknown as import("@/types/database").Flight[];
  const local = observations.filter((f) => f.data_source === "adsb1090");
  const flights = [
    ...(local.length ? local : legacy.filter((f) => f.data_source !== "flightaware")),
    ...observations.filter((f) => f.data_source === "flightaware"),
  ];
  const schedules = boardSchedules.length
    ? boardSchedules
    : legacy.filter((f) => f.data_source === "flightaware");
  // Rows are newest-first, so the first row's updated_at is the data age the
  // UI reports. lastUpdate is only when this response was generated.
  const newest = flights.find((f) => f.data_source !== "flightaware") as
    | { updated_at?: string }
    | undefined;

  return Response.json(
    {
      flights,
      schedules,
      schedulePartial: true,
      regionalSnapshot: {
        partial: true,
        capturedAt:
          observations
            .filter((f) => f.data_source === "flightaware")
            .map((f) => f.fetched_at)
            .filter(Boolean)
            .sort()
            .at(-1) ?? null,
      },
      dataUpdatedAt: newest?.updated_at ?? null,
      receiver,
      lastUpdate: Date.now(),
    },
    {
      status: 200,
      headers: {
        // Edge-cache the shared snapshot; serve stale briefly while revalidating.
        "Cache-Control": `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${REFRESH_SECONDS * 2}`,
      },
    }
  );
}

export async function GET() {
  try {
    return await snapshot();
  } catch {
    return Response.json(
      { flights: [], error: "Flight data unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
