"use client";

import { useEffect, useState, useRef } from "react";
import type { Flight } from "@/types/database";
import type { ConnectionStatus } from "@/services/realtime";
import { logger } from "@/lib/logger";

// Client polls the edge-cached snapshot route instead of Supabase directly, so
// viewer count no longer drives Supabase egress. Poll faster than the server
// refresh window — these hits land on Vercel's CDN, not Supabase.
const SNAPSHOT_URL = "/api/flights/snapshot";
const CLIENT_POLL_MS = 10_000;

interface UseFlightsReturn {
  flights: Flight[];
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  lastUpdate: number | null;
  /** Set of flight IDs that changed in the last batch (for highlight animations). */
  recentlyChanged: Set<string>;
}

export function useFlights(): UseFlightsReturn {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set());
  const clearHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cost-control mode: no realtime socket. Read the shared, edge-cached
    // snapshot route so Supabase egress is decoupled from viewer count.
    async function fetchFlights() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      try {
        const resp = await fetch(SNAPSHOT_URL);
        if (!resp.ok) {
          throw new Error(`snapshot request failed (${resp.status})`);
        }
        const body = (await resp.json()) as { flights: Flight[] };
        setFlights(body.flights ?? []);
        setError(null);
        setConnectionStatus("connected");
        setLastUpdate(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : "snapshot fetch failed";
        logger.error("flight snapshot fetch failed", { error: message });
        setError(message);
        setConnectionStatus("disconnected");
      }
      setLoading(false);
    }

    void fetchFlights();
    const interval = setInterval(fetchFlights, CLIENT_POLL_MS);
    const highlightTimer = clearHighlightTimer;

    return () => {
      clearInterval(interval);
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
      }
    };
  }, []);

  return { flights, loading, error, connectionStatus, lastUpdate, recentlyChanged };
}
