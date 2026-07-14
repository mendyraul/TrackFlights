import { supabase } from "@/lib/supabase";

// Recent position trail for a single aircraft, read from the flight_positions
// time-series. Edge-cached like the snapshot so selecting a plane doesn't drive
// per-viewer Supabase egress.
const TRAIL_LIMIT = 200;
const REFRESH_SECONDS = Number(process.env.TRAIL_REFRESH_SECONDS ?? 15);

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ hex: string }> }) {
  const { hex } = await params;

  const { data, error } = await supabase
    .from("flight_positions")
    .select("latitude,longitude,altitude_ft,recorded_at")
    .eq("hex", hex.toUpperCase())
    .order("recorded_at", { ascending: false })
    .limit(TRAIL_LIMIT);

  if (error) {
    return Response.json(
      { positions: [], error: error.message },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Oldest → newest so the client can draw a continuous polyline.
  const positions = (data ?? []).slice().reverse();

  return Response.json(
    { positions },
    {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${REFRESH_SECONDS * 2}`,
      },
    }
  );
}
