"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DelayPrediction } from "@/types/database";

interface Props {
  predictions: DelayPrediction[];
}

const RISK_BUCKETS = [
  { label: "0-10%", min: 0, max: 0.1, color: "#22c55e" },
  { label: "10-30%", min: 0.1, max: 0.3, color: "#84cc16" },
  { label: "30-50%", min: 0.3, max: 0.5, color: "#facc15" },
  { label: "50-70%", min: 0.5, max: 0.7, color: "#f97316" },
  { label: "70-100%", min: 0.7, max: 1.01, color: "#ef4444" },
];

export function DelayPredictionChart({ predictions }: Props) {
  const riskScores = predictions
    .filter((p) => p.prediction_type === "delay_risk")
    .map((p) => p.predicted_value);

  const data = RISK_BUCKETS.map((bucket) => ({
    name: bucket.label,
    count: riskScores.filter((r) => r >= bucket.min && r < bucket.max).length,
    color: bucket.color,
  }));

  if (riskScores.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">
          Delay Risk Distribution
        </h3>
        <div className="flex h-48 items-center justify-center text-sm text-gray-600">
          No prediction data available
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Delay Risk Distribution
        </h3>
        <span className="text-xs text-gray-600">
          {riskScores.length} flights scored
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
            label={{
              value: "Flights",
              angle: -90,
              position: "insideLeft",
              style: { fill: "#6b7280", fontSize: 11 },
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#16213e",
              border: "1px solid #374151",
              borderRadius: "8px",
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" name="Flights" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
