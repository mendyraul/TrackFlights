"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { AnalyticsDaily } from "@/types/database";

interface Props {
  daily: AnalyticsDaily[];
}

export function TrafficVolumeChart({ daily }: Props) {
  // Group by date, merge arrivals + departures
  const byDate = new Map<
    string,
    { date: string; arrivals: number; departures: number }
  >();

  for (const d of daily) {
    const dateStr = new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const existing = byDate.get(d.date) || {
      date: dateStr,
      arrivals: 0,
      departures: 0,
    };
    if (d.direction === "arrival") {
      existing.arrivals += d.total_flights;
    } else {
      existing.departures += d.total_flights;
    }
    byDate.set(d.date, existing);
  }

  const data = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">
          Traffic Volume (Daily)
        </h3>
        <div className="flex h-48 items-center justify-center text-gray-600 text-sm">
          No daily data available yet. Data populates as flights are processed.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">
        Traffic Volume (Daily)
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#16213e",
              border: "1px solid #374151",
              borderRadius: "8px",
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
          />
          <Bar
            dataKey="arrivals"
            fill="#3b82f6"
            name="Arrivals"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="departures"
            fill="#00d4ff"
            name="Departures"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
