"use client";

import { SourceFilter } from "@/components/ui/SourceFilter";
import { useState } from "react";
import type { MapFilterState } from "@/components/map/MapView";
import { PHASE_LABEL, type FlightPhase } from "@/lib/phase";
import { LAST_SEEN_COLOR } from "@/lib/freshness";

interface Props {
  filters: MapFilterState;
  onChange: (filters: MapFilterState) => void;
  operators: string[];
  totalCount: number;
  mappableCount: number;
  /** Receiver positions no longer being heard (drawn grey). */
  lastSeenCount?: number;
}

const PHASES: FlightPhase[] = ["arriving", "departing", "overflight", "other-airport", "on-ground"];
const control =
  "rounded border border-gray-700 bg-mia-dark px-2 py-1.5 text-sm text-gray-200 focus:border-mia-accent focus:outline-none";

export function MapFilters({
  filters,
  onChange,
  operators,
  totalCount,
  mappableCount,
  lastSeenCount = 0,
}: Props) {
  const update = (patch: Partial<MapFilterState>) => onChange({ ...filters, ...patch });
  // Collapsed by default on phones so the controls don't cover half the map.
  const [open, setOpen] = useState(false);
  const active =
    (filters.source && filters.source !== "all") ||
    filters.airports === "all" ||
    filters.phase !== "all" ||
    Boolean(filters.operator) ||
    Boolean(filters.search);

  return (
    <div className="absolute left-3 right-3 top-3 z-[1000] flex flex-col items-start gap-2 sm:right-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="map-filters"
        className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-700 bg-mia-panel/95 px-3 text-sm text-gray-200 shadow-lg backdrop-blur-sm sm:hidden"
      >
        Filters{active ? " •" : ""}
        <span className="text-xs text-gray-400">{mappableCount} on map</span>
      </button>

      <div
        id="map-filters"
        className={`${open ? "flex" : "hidden"} w-full flex-wrap items-end gap-2 rounded-lg border border-gray-700 bg-mia-panel/95 px-3 py-2 shadow-lg backdrop-blur-sm sm:flex sm:w-auto`}
      >
        <SourceFilter value={filters.source ?? "all"} onChange={(source) => update({ source })} />
        <label className="flex flex-col gap-0.5 text-[11px] text-gray-400">
          Airports
          <select
            className={control}
            value={filters.airports ?? "scheduled"}
            onChange={(e) => update({ airports: e.target.value as "scheduled" | "all" })}
          >
            <option value="scheduled">Planned schedule coverage</option>
            <option value="all">All nearby airports</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-gray-400">
          Phase
          <select
            value={filters.phase}
            onChange={(e) => update({ phase: e.target.value as MapFilterState["phase"] })}
            className={control}
          >
            <option value="all">All aircraft</option>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5 text-[11px] text-gray-400">
          Operator
          <select
            value={filters.operator}
            onChange={(e) => update({ operator: e.target.value })}
            className={`${control} max-w-[12rem]`}
          >
            <option value="">All operators</option>
            {operators.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5 text-[11px] text-gray-400">
          Callsign or hex
          <input
            type="search"
            placeholder="e.g. AAL123"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className={`${control} w-32 placeholder-gray-500`}
          />
        </label>
      </div>

      <div className="hidden rounded-lg border border-gray-700 bg-mia-panel/95 px-3 py-1.5 text-xs text-gray-300 shadow-lg backdrop-blur-sm sm:block">
        {mappableCount} on map · {totalCount} total
        <span className="ml-3 text-[#39FF14]">● My receiver</span> ·{" "}
        <span className="text-[#FFFF00]">● FlightAware daily snapshot</span>
        {lastSeenCount > 0 && (
          <>
            {" "}
            · <span style={{ color: LAST_SEEN_COLOR }}>● Last seen by my receiver</span>
          </>
        )}
      </div>
    </div>
  );
}
