"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Flight } from "@/types/database";

export function useFlights() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch
    async function fetchFlights() {
      const { data, error } = await supabase
        .from("flights_current")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setFlights(data as Flight[]);
      }
      setLoading(false);
    }

    fetchFlights();

    // Realtime subscription
    const channel = supabase
      .channel("flights_current_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flights_current" },
        (payload) => {
          setFlights((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((f) => f.id !== payload.old.id);
            }
            const updated = payload.new as Flight;
            const idx = prev.findIndex((f) => f.id === updated.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            return [updated, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { flights, loading, error };
}
