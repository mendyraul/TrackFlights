"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Flight } from "@/types/database";
import {
  FlightRealtimeService,
  type ConnectionStatus,
  type RealtimeEvent,
} from "@/services/realtime";

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
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(
    new Set()
  );
  const clearHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleRealtimeEvents = useCallback((events: RealtimeEvent[]) => {
    const changedIds = new Set<string>();

    setFlights((prev) => {
      const next = [...prev];

      for (const event of events) {
        changedIds.add(event.flight.id);

        if (event.type === "DELETE") {
          const idx = next.findIndex((f) => f.id === event.flight.id);
          if (idx >= 0) next.splice(idx, 1);
        } else {
          // INSERT or UPDATE
          const idx = next.findIndex((f) => f.id === event.flight.id);
          if (idx >= 0) {
            next[idx] = event.flight;
          } else {
            next.unshift(event.flight);
          }
        }
      }

      return next;
    });

    setLastUpdate(Date.now());

    // Mark changed flights for highlight animation
    setRecentlyChanged(changedIds);
    if (clearHighlightTimer.current) {
      clearTimeout(clearHighlightTimer.current);
    }
    clearHighlightTimer.current = setTimeout(() => {
      setRecentlyChanged(new Set());
    }, 2000);
  }, []);

  useEffect(() => {
    // Initial fetch
    async function fetchFlights() {
      const { data, error: fetchError } = await supabase
        .from("flights_current")
        .select("*")
        .order("updated_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setFlights(data as Flight[]);
      }
      setLoading(false);
    }

    fetchFlights();

    // Start realtime service
    const service = new FlightRealtimeService({
      onEvent: handleRealtimeEvents,
      onStatusChange: setConnectionStatus,
    });
    service.connect();

    return () => {
      service.disconnect();
      if (clearHighlightTimer.current) {
        clearTimeout(clearHighlightTimer.current);
      }
    };
  }, [handleRealtimeEvents]);

  return { flights, loading, error, connectionStatus, lastUpdate, recentlyChanged };
}
