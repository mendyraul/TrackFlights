"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AnalyticsHourly } from "@/types/database";

interface Props {
  hourly: AnalyticsHourly[];
}

export function DelayTrendsChart({ hourly }: Props) {
  // Sort chronologically and format for chart
  const data = [...hourly]
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .map((h) => ({
      time: new Date(h.hour).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      avgDelay: Math.round(h.avg_delay_minutes * 10) / 10,
      delayed: h.delayed,
      onTime: h.on_time,
      total: h.total_flights,
    }));

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
        <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">
          Delay Trends (Hourly)
        </h3>
        <div className="flex h-48 items-center justify-center text-gray-600 text-sm">
          No hourly data available yet. Data populates as the ingestor runs.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-500">
        Delay Trends (Hourly)
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="delayGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#facc15" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={{ stroke: "#374151" }}
            label={{
              value: "Avg Delay (min)",
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
          <Area
            type="monotone"
            dataKey="avgDelay"
            stroke="#facc15"
            fill="url(#delayGradient)"
            name="Avg Delay (min)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
