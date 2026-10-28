"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrafficForecast, TrafficHourly } from "@/types/database";
import { EmptyChart, Panel } from "@/components/analytics/LiveTraffic";

/** Fewer hours than this reads as noise, so show "collecting" instead of a chart. */
const MIN_HOURS = 3;

const hourLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  });

interface Point {
  key: string;
  hour: string;
  Arriving?: number;
  Departing?: number;
  Overflights?: number;
  "On ground"?: number;
  Forecast?: number;
}

/** History bars plus forecast points, one row per hour, in time order. */
export function chartData(hours: TrafficHourly[], forecast: TrafficForecast[]): Point[] {
  const rows = new Map<string, Point>();
  for (const h of hours) {
    const key = new Date(h.hour).toISOString();
    rows.set(key, {
      key,
      hour: hourLabel(h.hour),
      Arriving: h.arriving,
      Departing: h.departing,
      Overflights: h.overflights,
      "On ground": h.on_ground,
    });
  }
  for (const f of forecast) {
    const key = new Date(f.hour).toISOString();
    const row = rows.get(key) ?? { key, hour: hourLabel(f.hour) };
    row.Forecast = f.predicted_aircraft;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function TrafficHistoryChart({
  hours,
  forecast = [],
}: {
  hours: TrafficHourly[];
  forecast?: TrafficForecast[];
}) {
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

  const data = chartData(hours, forecast);
  const busiest = hours.reduce((a, b) => (b.unique_aircraft > a.unique_aircraft ? b : a));
  const range = Math.max(...hours.map((h) => h.max_range_km ?? 0));
  const model = forecast[0];

  return (
    <Panel
      title={forecast.length ? "Aircraft per hour, with forecast" : "Aircraft per hour (last 48 h)"}
    >
      <p className="mb-3 text-sm text-gray-300">
        Busiest hour: <strong>{busiest.unique_aircraft}</strong> aircraft at{" "}
        {hourLabel(busiest.hour)}. Farthest contact: <strong>{Math.round(range)} km</strong>.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data}>
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
          {forecast.length > 0 && (
            <Line
              dataKey="Forecast"
              stroke="#f472b6"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-gray-400">
        Each aircraft counts once per hour, in the phase it was last seen in. Times are Miami time.
      </p>
      {model?.model_mae != null && model.baseline_mae != null && (
        <p className="mt-1 text-xs text-gray-400">
          Forecast: a model trained on this receiver&apos;s history (calendar, weather, same hour
          last week). On a held-out week it was off by {model.model_mae.toFixed(1)} aircraft/hour on
          average, vs {model.baseline_mae.toFixed(1)} for the best simple baseline.
        </p>
      )}
    </Panel>
  );
}
