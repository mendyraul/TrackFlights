"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useFlights } from "@/hooks/useFlights";
import type { Flight, FlightDirection } from "@/types/database";
import { FlightDetailSidebar } from "@/components/map/FlightDetailSidebar";
import { MapFilters } from "@/components/map/MapFilters";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";

const FlightMap = dynamic(() => import("@/components/map/FlightMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-mia-dark">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-mia-accent border-t-transparent" />
        <p className="text-gray-400">Loading map...</p>
      </div>
    </div>
  ),
});

export interface MapFilterState {
  direction: FlightDirection | "all";
  status: string;
  airline: string;
  search: string;
}

export function MapView() {
  const { flights, loading, error, connectionStatus, lastUpdate, recentlyChanged } =
    useFlights();
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [filters, setFilters] = useState<MapFilterState>({
    direction: "all",
    status: "",
    airline: "",
    search: "",
  });

  const filtered = flights.filter((f) => {
    if (filters.direction !== "all" && f.direction !== filters.direction) return false;
    if (filters.status && f.status !== filters.status) return false;
    if (filters.airline && f.airline_iata !== filters.airline) return false;
    if (
      filters.search &&
      !f.flight_iata.toLowerCase().includes(filters.search.toLowerCase())
    )
      return false;
    return true;
  });

  const mappable = filtered.filter((f) => f.latitude != null && f.longitude != null);

  const airlines = [
    ...new Set(flights.map((f) => f.airline_iata).filter(Boolean)),
  ].sort() as string[];

  // Keep selected flight in sync with realtime updates
  const syncedSelected = selectedFlight
    ? flights.find((f) => f.id === selectedFlight.id) ?? selectedFlight
    : null;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center bg-mia-dark">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-mia-accent border-t-transparent" />
          <p className="text-gray-400">Loading flights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100vh-120px)]">
      {/* Sidebar (flight detail) */}
      {syncedSelected && (
        <FlightDetailSidebar
          flight={syncedSelected}
          isUpdating={recentlyChanged.has(syncedSelected.id)}
          onClose={() => setSelectedFlight(null)}
        />
      )}

      {/* Map area */}
      <div className="relative flex-1">
        {error && (
          <div className="absolute top-2 left-1/2 z-[1000] -translate-x-1/2 rounded bg-red-900/90 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Filters */}
        <MapFilters
          filters={filters}
          onChange={setFilters}
          airlines={airlines}
          totalCount={filtered.length}
          mappableCount={mappable.length}
        />

        {/* Connection status */}
        <div className="absolute right-4 top-4 z-[1000]">
          <div className="rounded-lg border border-gray-700 bg-mia-panel/95 px-3 py-2 shadow-lg backdrop-blur-sm">
            <ConnectionBadge status={connectionStatus} lastUpdate={lastUpdate} />
          </div>
        </div>

        {/* Map */}
        <FlightMap
          flights={mappable}
          onSelect={setSelectedFlight}
          selectedId={syncedSelected?.id ?? null}
          recentlyChanged={recentlyChanged}
        />
      </div>
    </div>
  );
}
