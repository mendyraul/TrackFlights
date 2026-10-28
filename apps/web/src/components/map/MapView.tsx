"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useFlights } from "@/hooks/useFlights";
import { supabase } from "@/lib/supabase";
import type { Flight, FlightDirection } from "@/types/database";
import { airportCoords } from "@/lib/airports";
import { FlightDetailSidebar } from "@/components/map/FlightDetailSidebar";
import { MapFilters } from "@/components/map/MapFilters";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";

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

type RouteLine = {
  origin: [number, number];
  destination: [number, number];
};

export interface MapFilterState {
  direction: FlightDirection | "all";
  status: string;
  airline: string;
  search: string;
}

export function MapView() {
  const { flights, loading, freshness, dataUpdatedAt, now, recentlyChanged } = useFlights();
  const stale = freshness === "offline" || freshness === "error";
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [refinedRoute, setRefinedRoute] = useState<{ key: string; line: RouteLine } | null>(null);
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
    if (filters.search && !f.flight_iata.toLowerCase().includes(filters.search.toLowerCase()))
      return false;
    return true;
  });

  const mappable = filtered.filter((f) => f.latitude != null && f.longitude != null);

  const airlines = [
    ...new Set(flights.map((f) => f.airline_iata).filter(Boolean)),
  ].sort() as string[];

  // Keep selected flight in sync with realtime updates
  const syncedSelected = selectedFlight
    ? (flights.find((f) => f.id === selectedFlight.id) ?? selectedFlight)
    : null;

  // Origin/destination of the selected flight, highlighted on the map.
  const highlightedAirports = syncedSelected
    ? [syncedSelected.origin_iata, syncedSelected.destination_iata].filter((code): code is string =>
        Boolean(code)
      )
    : [];

  const routeKey =
    syncedSelected?.origin_iata && syncedSelected?.destination_iata
      ? syncedSelected.origin_iata + ":" + syncedSelected.destination_iata
      : null;
  const staticOrigin = airportCoords(syncedSelected?.origin_iata ?? "");
  const staticDestination = airportCoords(syncedSelected?.destination_iata ?? "");
  const routeLine =
    refinedRoute?.key === routeKey
      ? refinedRoute.line
      : staticOrigin && staticDestination
        ? { origin: staticOrigin, destination: staticDestination }
        : null;

  useEffect(() => {
    const origin = syncedSelected?.origin_iata;
    const destination = syncedSelected?.destination_iata;

    if (!origin || !destination) return;

    let cancelled = false;

    async function refineFromDatabase() {
      type AirportRow = {
        iata_code: string;
        latitude: number | null;
        longitude: number | null;
      };

      let rows: AirportRow[] = [];
      try {
        const { data, error: airportError } = await supabase
          .from("airports")
          .select("iata_code, latitude, longitude")
          .in("iata_code", [origin, destination]);
        if (airportError || !data) return;
        rows = data as AirportRow[];
      } catch {
        // Unreachable database: the static line already drawn stands.
        return;
      }

      if (cancelled) return;

      const byCode = new Map(rows.map((row) => [row.iata_code, row] as const));
      const coords = (iata: string): [number, number] | null => {
        const row = byCode.get(iata);
        return row?.latitude != null && row.longitude != null
          ? [row.latitude, row.longitude]
          : airportCoords(iata);
      };

      const resolvedOrigin = coords(origin!);
      const resolvedDestination = coords(destination!);
      if (!resolvedOrigin || !resolvedDestination) return;

      setRefinedRoute({
        key: origin + ":" + destination,
        line: { origin: resolvedOrigin, destination: resolvedDestination },
      });
    }

    void refineFromDatabase();

    return () => {
      cancelled = true;
    };
  }, [syncedSelected?.id, syncedSelected?.origin_iata, syncedSelected?.destination_iata]);

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
        <DataStatusBanner
          freshness={freshness}
          dataUpdatedAt={dataUpdatedAt}
          now={now}
          showing={mappable.length > 0 ? "the last known positions, greyed out" : undefined}
          className="absolute bottom-6 left-1/2 z-[1000] w-[min(92%,40rem)] -translate-x-1/2"
        />

        {/* Filters */}
        <MapFilters
          filters={filters}
          onChange={setFilters}
          airlines={airlines}
          totalCount={filtered.length}
          mappableCount={mappable.length}
        />

        {/* Map */}
        <FlightMap
          flights={mappable}
          onSelect={setSelectedFlight}
          selectedId={syncedSelected?.id ?? null}
          routeLine={routeLine}
          recentlyChanged={recentlyChanged}
          highlightedAirports={highlightedAirports}
          stale={stale}
        />
      </div>
    </div>
  );
}
