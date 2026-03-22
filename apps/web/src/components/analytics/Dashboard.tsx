"use client";

import { useAnalytics } from "@/hooks/useAnalytics";

export function Dashboard() {
  const { hourly, daily, loading } = useAnalytics();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">Loading analytics...</p>
      </div>
    );
  }

  // Compute summary stats from daily data
  const latestDaily = daily[0];
  const totalFlights = daily.reduce((sum, d) => sum + d.total_flights, 0);
  const totalOnTime = daily.reduce((sum, d) => sum + d.on_time, 0);
  const totalDelayed = daily.reduce((sum, d) => sum + d.delayed, 0);
  const totalCancelled = daily.reduce((sum, d) => sum + d.cancelled, 0);
  const totalDiverted = daily.reduce((sum, d) => sum + d.diverted, 0);
  const onTimeRate = totalFlights > 0 ? ((totalOnTime / totalFlights) * 100).toFixed(1) : "--";
  const avgDelay = daily.length > 0
    ? (daily.reduce((sum, d) => sum + d.avg_delay_minutes, 0) / daily.length).toFixed(1)
    : "--";

  const stats = [
    { label: "Total Flights (30d)", value: totalFlights.toLocaleString() },
    { label: "On-Time Rate", value: `${onTimeRate}%` },
    { label: "Avg Delay", value: `${avgDelay} min` },
    { label: "Cancelled", value: totalCancelled.toLocaleString() },
    { label: "Diverted", value: totalDiverted.toLocaleString() },
    { label: "Delayed", value: totalDelayed.toLocaleString() },
  ];

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-semibold text-gray-200">
        Operations Dashboard
      </h2>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-800 bg-mia-panel p-4"
          >
            <p className="text-sm text-gray-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-mia-accent">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart placeholders */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-400">
            Delay Trends (Hourly)
          </h3>
          <div className="flex h-48 items-center justify-center text-gray-500">
            {/* TODO: Recharts AreaChart with hourly delay data */}
            Chart placeholder — {hourly.length} data points
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-mia-panel p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-400">
            Traffic Volume (Daily)
          </h3>
          <div className="flex h-48 items-center justify-center text-gray-500">
            {/* TODO: Recharts BarChart with daily traffic */}
            Chart placeholder — {daily.length} data points
          </div>
        </div>
      </div>
    </div>
  );
}
