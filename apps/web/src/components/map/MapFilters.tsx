"use client";

import type { MapFilterState } from "@/components/map/MapView";
import type { FlightDirection } from "@/types/database";

interface Props {
  filters: MapFilterState;
  onChange: (filters: MapFilterState) => void;
  airlines: string[];
  totalCount: number;
  mappableCount: number;
}

export function MapFilters({
  filters,
  onChange,
  airlines,
  totalCount,
  mappableCount,
}: Props) {
  const update = (patch: Partial<MapFilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="absolute left-4 top-4 z-[1000] flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-mia-panel/95 px-3 py-2 shadow-lg backdrop-blur-sm">
        {/* Direction */}
        <select
          value={filters.direction}
          onChange={(e) =>
            update({ direction: e.target.value as FlightDirection | "all" })
          }
          className="rounded border border-gray-700 bg-mia-dark px-2 py-1 text-xs text-gray-200"
        >
          <option value="all">All Flights</option>
          <option value="arrival">Arrivals</option>
          <option value="departure">Departures</option>
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          className="rounded border border-gray-700 bg-mia-dark px-2 py-1 text-xs text-gray-200"
        >
          <option value="">Any Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="en_route">En Route</option>
          <option value="landed">Landed</option>
          <option value="delayed">Delayed</option>
          <option value="cancelled">Cancelled</option>
          <option value="diverted">Diverted</option>
        </select>

        {/* Airline */}
        <select
          value={filters.airline}
          onChange={(e) => update({ airline: e.target.value })}
          className="rounded border border-gray-700 bg-mia-dark px-2 py-1 text-xs text-gray-200"
        >
          <option value="">All Airlines</option>
          {airlines.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        {/* Search */}
        <input
          type="text"
          placeholder="Flight #"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="w-24 rounded border border-gray-700 bg-mia-dark px-2 py-1 text-xs text-gray-200 placeholder-gray-500"
        />
      </div>

      {/* Stats badge */}
      <div className="rounded-lg border border-gray-700 bg-mia-panel/95 px-3 py-1.5 text-xs text-gray-400 shadow-lg backdrop-blur-sm">
        {mappableCount} on map · {totalCount} total
      </div>
    </div>
  );
}
