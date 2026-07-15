"use client";

import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "@/lib/dashboard-summary";
import type { DelayPrediction } from "@/types/database";

const POLL_MS = 5 * 60 * 1000;

interface UsePredictionsReturn {
  predictions: DelayPrediction[];
  highRiskFlights: DelayPrediction[];
  loading: boolean;
}

export function usePredictions(): UsePredictionsReturn {
  const [predictions, setPredictions] = useState<DelayPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const summary = await fetchDashboardSummary();
        if (cancelled) return;
        setPredictions(summary.predictions);
      } catch {
        // Keep last known data; the next poll retries.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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
