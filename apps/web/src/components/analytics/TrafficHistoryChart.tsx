"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrafficHourly } from "@/types/database";
import { EmptyChart, Panel } from "@/components/analytics/LiveTraffic";

/** Fewer hours than this reads as noise, so show "collecting" instead of a chart. */
const MIN_HOURS = 3;

const hourLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  });

export function TrafficHistoryChart({ hours }: { hours: TrafficHourly[] }) {
  if (hours.length < MIN_HOURS) {
    return (
      <Panel title="Aircraft per hour (last 48 h)">
        <EmptyChart
          text={
            hours.length === 0
              ? "Collecting data — hourly history starts recording once the receiver is running. Check back in a few hours."
              : `Collecting data — ${hours.length} of ${MIN_HOURS} hours recorded so far. Check back soon.`
          }
        />
      </Panel>
    );
  }

  const data = hours.map((h) => ({
    hour: hourLabel(h.hour),
    Arriving: h.arriving,
    Departing: h.departing,
    Overflights: h.overflights,
    "On ground": h.on_ground,
  }));
  const busiest = hours.reduce((a, b) => (b.unique_aircraft > a.unique_aircraft ? b : a));
  const range = Math.max(...hours.map((h) => h.max_range_km ?? 0));

  return (
    <Panel title="Aircraft per hour (last 48 h)">
      <p className="mb-3 text-sm text-gray-300">
        Busiest hour: <strong>{busiest.unique_aircraft}</strong> aircraft at{" "}
        {hourLabel(busiest.hour)}. Farthest contact: <strong>{Math.round(range)} km</strong>.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="hour" tick={{ fill: "#9ca3af", fontSize: 11 }} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#16213e",
              border: "1px solid #374151",
              borderRadius: "8px",
              fontSize: 12,
            }}
            cursor={{ fill: "#ffffff0d" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Arriving" stackId="a" fill="#38bdf8" />
          <Bar dataKey="Departing" stackId="a" fill="#34d399" />
          <Bar dataKey="Overflights" stackId="a" fill="#9ca3af" />
          <Bar dataKey="On ground" stackId="a" fill="#fbbf24" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-gray-400">
        Each aircraft counts once per hour, in the phase it was last seen in. Times are Miami time.
      </p>
    </Panel>
  );
}
