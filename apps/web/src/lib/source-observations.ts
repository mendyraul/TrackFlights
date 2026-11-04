import { supabase } from "@/lib/supabase";
import { withinDeadline } from "@/lib/health";
import type { Flight } from "@/types/database";

export async function readObservations(): Promise<Flight[]> {
  try {
    const { data, error } = await withinDeadline((signal) =>
      supabase
        .from("aircraft_observations")
        .select("source,observed_at,fetched_at,payload")
        .gte("observed_at", new Date(Date.now() - 48 * 3600_000).toISOString())
        .order("observed_at", { ascending: false })
        .limit(500)
        .abortSignal(signal)
    );
    if (error) return [];
    return (
      (data ?? []) as unknown as {
        payload: Flight;
        source: "adsb1090" | "flightaware";
        observed_at: string;
        fetched_at: string;
      }[]
    ).map((row) => ({
      ...(row.payload as unknown as Flight),
      data_source: row.source,
      observed_at: row.observed_at,
      updated_at: row.observed_at,
      fetched_at: row.fetched_at,
    }));
  } catch {
    return [];
  }
}

export async function readSchedules(): Promise<Flight[]> {
  try {
    const { data, error } = await withinDeadline((signal) =>
      supabase
        .from("airport_schedule_snapshots")
        .select("flights,fetched_at")
        .eq("airport", "MIA")
        .gte("fetched_at", new Date(Date.now() - 48 * 3600_000).toISOString())
        .abortSignal(signal)
    );
    if (error) return [];
    const rows = (data ?? []) as unknown as { flights: Flight[]; fetched_at: string }[];
    const unique = new Map<string, Flight>();
    for (const row of rows)
      for (const flight of row.flights)
        unique.set(flight.id, { ...flight, fetched_at: row.fetched_at });
    return [...unique.values()];
  } catch {
    return [];
  }
}

export async function readReceiverObservationTime(): Promise<string | null> {
  try {
    const { data, error } = await withinDeadline((signal) =>
      supabase
        .from("aircraft_observations")
        .select("observed_at")
        .eq("source", "adsb1090")
        .order("observed_at", { ascending: false })
        .limit(1)
        .abortSignal(signal)
    );
    if (error) return null;
    return (data as unknown as { observed_at: string }[] | null)?.[0]?.observed_at ?? null;
  } catch {
    return null;
  }
}
