"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useFlights } from "@/hooks/useFlights";
import type { Flight } from "@/types/database";
import { airportCoords } from "@/lib/airports";
import { FlightDetailSidebar } from "@/components/map/FlightDetailSidebar";
import { MapFilters } from "@/components/map/MapFilters";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";
import { toAircraft, visibleFlights } from "@/lib/aircraft";
import type { FlightPhase } from "@/lib/phase";

const FlightMap = dynamic(() => import("@/components/map/FlightMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#1f1f22]" aria-hidden="true" />,
});

export interface MapFilterState {
  phase: FlightPhase | "all";
  operator: string;
  search: string;
}

export function MapView() {
  const {
    flights: allFlights,
    loading,
    freshness,
    dataUpdatedAt,
    now,
    recentlyChanged,
  } = useFlights();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<MapFilterState>({
    phase: "all",
    operator: "",
    search: "",
  });

  // Live: only aircraft heard recently. Offline: the last known picture, greyed.
  const aircraft = useMemo(
    () => visibleFlights(allFlights, freshness, now).map(toAircraft),
    // `now` ticks every second; the tracked set only needs a new snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFlights, freshness]
  );
  const stale = freshness === "offline" || freshness === "error";

  const operators = useMemo(
    () => [...new Set(aircraft.map((a) => a.operator.label))].sort(),
    [aircraft]
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toUpperCase();
    return aircraft.filter(
      (a) =>
        (filters.phase === "all" || a.phase === filters.phase) &&
        (!filters.operator || a.operator.label === filters.operator) &&
        (!q || a.ident.toUpperCase().includes(q) || (a.hex ?? "").includes(q))
    );
  }, [aircraft, filters]);

  const mappable = useMemo(
    () => filtered.map((a) => a.flight).filter((f) => f.latitude != null && f.longitude != null),
    [filtered]
  );

  const selected = selectedId ? (aircraft.find((a) => a.flight.id === selectedId) ?? null) : null;
  const selectedFlight = selected?.flight ?? null;

  // Route line and endpoint highlights only exist for rows with schedule data
  // (the optional AeroAPI feed). Coordinates come from the bundled airport
  // table, so selecting a flight never costs a database read.
  //
  // Everything handed to <FlightMap> is memoized: the page re-renders every
  // second (the "updated Xs ago" clock), and fresh arrays/callbacks would
  // re-render every marker on each tick.
  const originCode = selectedFlight?.origin_iata ?? null;
  const destinationCode = selectedFlight?.destination_iata ?? null;
  const highlightedAirports = useMemo(
    () => [originCode, destinationCode].filter((code): code is string => Boolean(code)),
    [originCode, destinationCode]
  );
  const routeLine = useMemo(() => {
    const origin = originCode ? airportCoords(originCode) : null;
    const destination = destinationCode ? airportCoords(destinationCode) : null;
    return origin && destination ? { origin, destination } : null;
  }, [originCode, destinationCode]);
  const onSelect = useCallback((f: Flight) => setSelectedId(f.id), []);

  // Escape closes the detail panel.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    // Header (3.5rem) + nav (2.75rem) = 6.25rem. dvh keeps the map from
    // sliding under mobile browser toolbars; vh is the fallback.
    <div className="relative flex h-[calc(100vh-6.25rem)] supports-[height:100dvh]:h-[calc(100dvh-6.25rem)]">
      {selected && (
        <FlightDetailSidebar
          aircraft={selected}
          now={now}
          isUpdating={recentlyChanged.has(selected.flight.id)}
          onClose={() => setSelectedId(null)}
        />
      )}

      <div className="relative flex-1">
        <MapFilters
          filters={filters}
          onChange={setFilters}
          operators={operators}
          totalCount={filtered.length}
          mappableCount={mappable.length}
        />

        {loading ? (
          <p
            role="status"
            className="absolute bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-full border border-gray-700 bg-mia-panel/95 px-4 py-2 text-sm text-gray-300 shadow-lg"
          >
            Loading aircraft…
          </p>
        ) : (
          <DataStatusBanner
            freshness={freshness}
            dataUpdatedAt={dataUpdatedAt}
            now={now}
            showing={mappable.length > 0 ? "the last known positions, greyed out" : undefined}
            className="absolute bottom-6 left-3 right-16 z-[1000] sm:left-1/2 sm:right-auto sm:w-[min(80%,40rem)] sm:-translate-x-1/2"
          />
        )}

        <FlightMap
          flights={mappable}
          onSelect={onSelect}
          selectedId={selectedId}
          routeLine={routeLine}
          recentlyChanged={recentlyChanged}
          highlightedAirports={highlightedAirports}
          stale={stale}
        />
      </div>
    </div>
  );
}
