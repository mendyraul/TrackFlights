import { supabase } from "@/lib/supabase";
import { withinDeadline } from "@/lib/health";
import { readReceiver } from "@/lib/receiver";
import { classifyFreshness, OFFLINE_AFTER_MS } from "@/lib/freshness";

export const dynamic = "force-dynamic";

/** Low-egress endpoint for independent ingestion monitoring. */
export async function GET() {
  const now = Date.now();
  try {
    const [result, receiver] = await Promise.all([
      withinDeadline((signal) =>
        supabase
          .from("flights_current")
          .select("updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .abortSignal(signal)
      ),
      readReceiver(),
    ]);
    if (result.error) throw new Error("Database unavailable");
    const rows = result.data as { updated_at: string }[] | null;
    const date = rows?.[0]?.updated_at ?? null;
    const parsed = date ? Date.parse(date) : NaN;
    const dataUpdatedAt = Number.isFinite(parsed) ? parsed : null;
    const freshness = classifyFreshness({
      loading: false,
      error: null,
      now,
      dataUpdatedAt,
      receiver,
    });
    const healthy = freshness === "live" || freshness === "delayed" || freshness === "silent";
    return Response.json(
      {
        status: healthy ? "ok" : "stale",
        check: "data",
        freshness,
        timestamp: new Date(now).toISOString(),
        dataUpdatedAt: date,
        receiver,
        staleAfterSeconds: OFFLINE_AFTER_MS / 1000,
      },
      { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { status: "unavailable", check: "data", freshness: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
