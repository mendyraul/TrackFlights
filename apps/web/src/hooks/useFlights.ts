"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Flight } from "@/types/database";
import type { ConnectionStatus } from "@/services/realtime";

const FLIGHT_COLUMNS = "id,flight_iata,airline_iata,departure_airport_iata,arrival_airport_iata,scheduled_departure,scheduled_arrival,estimated_departure,estimated_arrival,actual_departure,actual_arrival,status,terminal,gate,baggage_claim,delay_minutes,latitude,longitude,altitude_ft,speed_knots,heading,updated_at";

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
    // Cost-control mode: no realtime socket, projected columns, capped rows, slower polling.
    async function fetchFlights() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("flights_current")
        .select(FLIGHT_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(250);

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
    const interval = setInterval(fetchFlights, 2 * 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
      if (clearHighlightTimer.current) {
        clearTimeout(clearHighlightTimer.current);
      }
    };
  }, []);

  return { flights, loading, error, connectionStatus, lastUpdate, recentlyChanged };
}
