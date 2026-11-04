import { supabase } from "@/lib/supabase";
import { withinDeadline } from "@/lib/health";
import { BOARD_AIRPORTS } from "@/lib/airport-board";
import { lookupAirport } from "@/lib/airports";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ iata: string }> }) {
  const { iata: raw } = await params;
  const iata = raw.toUpperCase();
  const airport = lookupAirport(iata);
  if (!airport) return Response.json({ error: "Unknown airport" }, { status: 404 });
  if (!BOARD_AIRPORTS.includes(iata))
    return Response.json({ supported: false, baselines: [], progress: [] });
  try {
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const [baseline, progress] = await Promise.all([
      withinDeadline((signal) =>
        supabase
          .from("airport_schedule_baselines")
          .select("*")
          .eq("airport", iata)
          .gte("service_date", cutoff)
          .order("service_date", { ascending: false })
          .limit(16)
          .abortSignal(signal)
      ),
      withinDeadline((signal) =>
        supabase
          .from("airport_flight_progress")
          .select("*")
          .eq("airport", iata)
          .gte("service_date", cutoff)
          .limit(500)
          .abortSignal(signal)
      ),
    ]);
    if (baseline.error || progress.error) throw new Error("Unavailable");
    return Response.json(
      { supported: true, baselines: baseline.data ?? [], progress: progress.data ?? [] },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch {
    return Response.json(
      { error: "Airport board unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
