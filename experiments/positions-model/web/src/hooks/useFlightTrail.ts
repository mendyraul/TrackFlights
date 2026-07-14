"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

// Fetch the recent position trail for the selected aircraft from the edge-cached
// /api/flights/[hex]/positions route. Returns the path as [lat, lon] pairs for a
// Leaflet polyline. Refreshes alongside the snapshot poll so the trail extends.
const POLL_MS = 10_000;

interface TrailPoint {
  latitude: number;
  longitude: number;
}

export function useFlightTrail(hex: string | null): [number, number][] {
  const [trail, setTrail] = useState<[number, number][]>([]);

  useEffect(() => {
    if (!hex) {
      setTrail([]);
      return;
    }

    let cancelled = false;

    async function fetchTrail(current: string) {
      try {
        const resp = await fetch(`/api/flights/${encodeURIComponent(current)}/positions`);
        if (!resp.ok) throw new Error(`trail request failed (${resp.status})`);
        const body = (await resp.json()) as { positions: TrailPoint[] };
        if (cancelled) return;
        setTrail((body.positions ?? []).map((p) => [p.latitude, p.longitude] as [number, number]));
      } catch (err) {
        const message = err instanceof Error ? err.message : "trail fetch failed";
        logger.error("flight trail fetch failed", { error: message });
      }
    }

    void fetchTrail(hex);
    const interval = setInterval(() => fetchTrail(hex), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hex]);

  return trail;
}
