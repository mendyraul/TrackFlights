"use client";

import type { Flight, FlightStatus } from "@/types/database";

interface Props {
  flights: Flight[];
}

const STATUS_CONFIG: {
  status: FlightStatus;
  label: string;
  color: string;
  bg: string;
}[] = [
  { status: "en_route", label: "En Route", color: "bg-blue-400", bg: "bg-blue-500/10" },
  { status: "scheduled", label: "Scheduled", color: "bg-gray-400", bg: "bg-gray-500/10" },
  { status: "landed", label: "Landed", color: "bg-green-400", bg: "bg-green-500/10" },
  { status: "departed", label: "Departed", color: "bg-emerald-400", bg: "bg-emerald-500/10" },
  { status: "delayed", label: "Delayed", color: "bg-yellow-400", bg: "bg-yellow-500/10" },
  { status: "cancelled", label: "Cancelled", color: "bg-red-400", bg: "bg-red-500/10" },
  { status: "diverted", label: "Diverted", color: "bg-orange-400", bg: "bg-orange-500/10" },
];

export function StatusBreakdown({ flights }: Props) {
  const total = flights.length;
  if (total === 0) return null;

  const counts = new Map<FlightStatus, number>();
  for (const f of flights) {
    counts.set(f.status, (counts.get(f.status) || 0) + 1);
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-mia-panel p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
        Live Status Breakdown
      </h3>

      {/* Stacked bar */}
      <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-mia-dark">
        {STATUS_CONFIG.map(({ status, color }) => {
          const count = counts.get(status) || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={status}
              className={`${color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${status}: ${count}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {STATUS_CONFIG.map(({ status, label, color, bg }) => {
          const count = counts.get(status) || 0;
          if (count === 0) return null;
          return (
            <div
              key={status}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${bg}`}
            >
              <span className={`h-2 w-2 rounded-full ${color}`} />
              <span className="text-xs text-gray-300">
                {label}: {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
