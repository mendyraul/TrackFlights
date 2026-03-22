"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useFlights } from "@/hooks/useFlights";
import type { Flight, FlightDirection } from "@/types/database";
import { FlightInfoPanel } from "@/components/map/FlightInfoPanel";
import { MapFilters } from "@/components/map/MapFilters";

// Leaflet must be loaded client-side only (no SSR)
const FlightMap = dynamic(() => import("@/components/map/FlightMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-mia-dark">
      <p className="text-gray-400">Loading map...</p>
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
  const { flights, loading, error } = useFlights();
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

  // Flights with position data for map rendering
  const mappable = filtered.filter((f) => f.latitude != null && f.longitude != null);

  // Unique airlines for filter dropdown
  const airlines = [...new Set(flights.map((f) => f.airline_iata).filter(Boolean))]
    .sort() as string[];

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center bg-mia-dark">
        <p className="text-gray-400">Loading flights...</p>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-120px)]">
      {error && (
        <div className="absolute top-2 left-1/2 z-[1000] -translate-x-1/2 rounded bg-red-900/90 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Map filters overlay */}
      <MapFilters
        filters={filters}
        onChange={setFilters}
        airlines={airlines}
        totalCount={filtered.length}
        mappableCount={mappable.length}
      />

      {/* Main map */}
      <FlightMap
        flights={mappable}
        onSelect={setSelectedFlight}
        selectedId={selectedFlight?.id ?? null}
      />

      {/* Flight info panel */}
      {selectedFlight && (
        <FlightInfoPanel
          flight={selectedFlight}
          onClose={() => setSelectedFlight(null)}
        />
      )}
    </div>
  );
}
