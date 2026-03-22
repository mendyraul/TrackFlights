"use client";

import type { DelayPrediction } from "@/types/database";

interface Props {
  predictions: DelayPrediction[];
}

function riskColor(risk: number): string {
  if (risk >= 0.7) return "text-red-400";
  if (risk >= 0.5) return "text-orange-400";
  if (risk >= 0.3) return "text-yellow-400";
  return "text-green-400";
}

function riskBg(risk: number): string {
  if (risk >= 0.7) return "bg-red-500/10 border-red-500/30";
  if (risk >= 0.5) return "bg-orange-500/10 border-orange-500/30";
  if (risk >= 0.3) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-green-500/10 border-green-500/30";
}

export function HighRiskFlights({ predictions }: Props) {
  // Get delay_risk predictions sorted by risk
  const riskPredictions = predictions
    .filter((p) => p.prediction_type === "delay_risk" && p.predicted_value > 0.3)
    .sort((a, b) => b.predicted_value - a.predicted_value)
    .slice(0, 10);

  // Get corresponding delay_minutes predictions
  const minutesPredictions = new Map(
    predictions
      .filter((p) => p.prediction_type === "delay_minutes")
      .map((p) => [p.flight_iata, p])
  );

  if (riskPredictions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-mia-panel p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
          High-Risk Flights
        </h3>
        <p className="mt-4 text-center text-sm text-gray-600">
          No high-risk flights detected
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-mia-panel p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
        High-Risk Flights — Delay Predictions
      </h3>
      <div className="space-y-2">
        {riskPredictions.map((pred) => {
          const minutesPred = minutesPredictions.get(pred.flight_iata);
          const factors = pred.factors || {};

          return (
            <div
              key={pred.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${riskBg(pred.predicted_value)}`}
            >
              {/* Risk score */}
              <div className="text-center">
                <p
                  className={`text-lg font-bold ${riskColor(pred.predicted_value)}`}
                >
                  {Math.round(pred.predicted_value * 100)}%
                </p>
                <p className="text-xs text-gray-500">risk</p>
              </div>

              {/* Flight info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-white">
                    {pred.flight_iata}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">
                    {pred.direction}
                  </span>
                  {minutesPred && (
                    <span className="text-xs text-yellow-400">
                      ~{Math.round(minutesPred.predicted_value)}min delay
                    </span>
                  )}
                </div>
                {/* Factor breakdown */}
                <div className="mt-1 flex gap-2">
                  {Object.entries(factors)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 3)
                    .map(([factor, weight]) => (
                      <span
                        key={factor}
                        className="rounded bg-mia-dark/50 px-1.5 py-0.5 text-xs text-gray-500"
                      >
                        {factor.replace("_", " ")}: {((weight as number) * 100).toFixed(0)}%
                      </span>
                    ))}
                </div>
              </div>

              {/* Confidence */}
              {pred.confidence && (
                <div className="text-right text-xs text-gray-500">
                  {Math.round(pred.confidence * 100)}% conf
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
