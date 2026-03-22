"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DelayPrediction } from "@/types/database";

interface UsePredictionsReturn {
  predictions: DelayPrediction[];
  highRiskFlights: DelayPrediction[];
  loading: boolean;
}

export function usePredictions(): UsePredictionsReturn {
  const [predictions, setPredictions] = useState<DelayPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const now = new Date().toISOString();

      const { data } = await supabase
        .from("delay_predictions")
        .select("*")
        .gte("expires_at", now)
        .order("predicted_value", { ascending: false });

      if (data) {
        setPredictions(data as DelayPrediction[]);
      }
      setLoading(false);
    }

    fetch();

    // Refresh every 2 minutes
    const interval = setInterval(fetch, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // High-risk flights: delay_risk > 0.5
  const highRiskFlights = predictions.filter(
    (p) => p.prediction_type === "delay_risk" && p.predicted_value > 0.5
  );

  return { predictions, highRiskFlights, loading };
}

/** Get predictions for a specific flight. */
export function getPredictionsForFlight(
  predictions: DelayPrediction[],
  flightIata: string
): {
  delayRisk: DelayPrediction | null;
  delayMinutes: DelayPrediction | null;
  onTimeProbability: DelayPrediction | null;
} {
  const forFlight = predictions.filter((p) => p.flight_iata === flightIata);
  return {
    delayRisk: forFlight.find((p) => p.prediction_type === "delay_risk") ?? null,
    delayMinutes: forFlight.find((p) => p.prediction_type === "delay_minutes") ?? null,
    onTimeProbability:
      forFlight.find((p) => p.prediction_type === "on_time_probability") ?? null,
  };
}
