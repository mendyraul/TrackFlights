"use client";

import type { AnalyticsDaily, Flight } from "@/types/database";

interface Props {
  daily: AnalyticsDaily[];
  flights: Flight[];
}

export function KpiCards({ daily, flights }: Props) {
  // Compute from analytics tables
  const totalFlights = daily.reduce((s, d) => s + d.total_flights, 0);
  const totalOnTime = daily.reduce((s, d) => s + d.on_time, 0);
  const totalDelayed = daily.reduce((s, d) => s + d.delayed, 0);
  const totalCancelled = daily.reduce((s, d) => s + d.cancelled, 0);
  const totalDiverted = daily.reduce((s, d) => s + d.diverted, 0);

  const onTimeRate =
    totalFlights > 0
      ? ((totalOnTime / totalFlights) * 100).toFixed(1)
      : "--";
  const cancelRate =
    totalFlights > 0
      ? ((totalCancelled / totalFlights) * 100).toFixed(1)
      : "--";
  const avgDelay =
    daily.length > 0
      ? (
          daily.reduce((s, d) => s + d.avg_delay_minutes, 0) / daily.length
        ).toFixed(1)
      : "--";

  // Live counts
  const activeNow = flights.length;
  const enRouteNow = flights.filter((f) => f.status === "en_route").length;

  const cards = [
    {
      label: "Active Flights",
      value: activeNow.toString(),
      sub: `${enRouteNow} en route`,
      color: "text-mia-accent",
    },
    {
      label: "On-Time Rate",
      value: `${onTimeRate}%`,
      sub: `${totalOnTime} of ${totalFlights}`,
      color: "text-green-400",
    },
    {
      label: "Avg Delay",
      value: `${avgDelay}m`,
      sub: `${totalDelayed} delayed flights`,
      color: "text-yellow-400",
    },
    {
      label: "Cancellation %",
      value: `${cancelRate}%`,
      sub: `${totalCancelled} cancelled`,
      color: "text-red-400",
    },
    {
      label: "Diversions",
      value: totalDiverted.toString(),
      sub: `over ${daily.length} days`,
      color: "text-orange-400",
    },
    {
      label: "Total Flights",
      value: totalFlights.toLocaleString(),
      sub: `${daily.length}-day period`,
      color: "text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-gray-800 bg-mia-panel p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {card.label}
          </p>
          <p className={`mt-1 text-2xl font-bold ${card.color}`}>
            {card.value}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
