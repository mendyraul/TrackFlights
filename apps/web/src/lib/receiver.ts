import { supabase } from "@/lib/supabase";
import { withinDeadline } from "@/lib/health";
import type { ReceiverStatus } from "@/lib/freshness";

/** Optional until the receiver-heartbeat migration and writer are deployed. */
export async function readReceiver(): Promise<ReceiverStatus | null> {
  try {
    const result = await withinDeadline((signal) =>
      supabase
        .from("ingestor_heartbeat")
        .select("last_poll_at,aircraft_received,aircraft_in_range")
        .eq("source", "adsb1090")
        .abortSignal(signal)
        .maybeSingle()
    );
    const row = result.data as {
      last_poll_at: string;
      aircraft_received: number;
      aircraft_in_range: number;
    } | null;
    if (result.error || !row) return null;
    if (
      !Number.isFinite(Date.parse(row.last_poll_at)) ||
      !Number.isFinite(row.aircraft_received) ||
      !Number.isFinite(row.aircraft_in_range) ||
      row.aircraft_received < 0 ||
      row.aircraft_in_range < 0
    )
      return null;
    return {
      lastPollAt: row.last_poll_at,
      received: row.aircraft_received,
      inRange: row.aircraft_in_range,
    };
  } catch {
    return null;
  }
}
