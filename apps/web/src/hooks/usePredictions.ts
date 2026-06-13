"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DelayPrediction } from "@/types/database";

const PREDICTION_COLUMNS =
  "flight_iata,prediction_type,predicted_value,confidence,model_version,generated_at,expires_at";

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
        .select(PREDICTION_COLUMNS)
        .gte("expires_at", now)
        .order("predicted_value", { ascending: false })
        .limit(500);

      if (data) setPredictions(data as DelayPrediction[]);
      setLoading(false);
    }

    fetch();
    const interval = setInterval(fetch, 2 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const highRiskFlights = predictions.filter(
    (p) => p.prediction_type === "delay_risk" && p.predicted_value > 0.5
  );

  return { predictions, highRiskFlights, loading };
}

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
    onTimeProbability: forFlight.find((p) => p.prediction_type === "on_time_probability") ?? null,
  };
}
