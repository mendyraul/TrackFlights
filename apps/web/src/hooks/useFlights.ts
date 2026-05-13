"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Flight } from "@/types/database";
import type { ConnectionStatus } from "@/services/realtime";

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


  useEffect(() => {
    // Temporary cost-control mode: no realtime socket, hourly polling only.
    async function fetchFlights() {
      const { data, error: fetchError } = await supabase
        .from("flights_current")
        .select("*")
        .order("updated_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setConnectionStatus("disconnected");
      } else {
        setFlights(data as Flight[]);
        setError(null);
        setConnectionStatus("connected");
        setLastUpdate(Date.now());
      }
      setLoading(false);
    }

    void fetchFlights();
    const interval = setInterval(fetchFlights, 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
      if (clearHighlightTimer.current) {
        clearTimeout(clearHighlightTimer.current);
      }
    };
  }, []);

  return { flights, loading, error, connectionStatus, lastUpdate, recentlyChanged };
}
