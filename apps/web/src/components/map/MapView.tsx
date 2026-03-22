"use client";

import { useFlights } from "@/hooks/useFlights";

export function MapView() {
  const { flights, loading, error } = useFlights();

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center">
        <p className="text-gray-400">Loading flights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-120px)] items-center justify-center">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  // TODO: Replace with Leaflet map component
  // Map will center on MIA (25.7959, -80.2870) and show aircraft icons
  return (
    <div className="relative h-[calc(100vh-120px)] bg-mia-dark">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-400">Interactive Map</p>
          <p className="text-sm text-gray-500">
            {flights.filter((f) => f.latitude && f.longitude).length} aircraft
            with position data
          </p>
          <p className="text-sm text-gray-500">
            {flights.length} total active flights
          </p>
        </div>
      </div>
    </div>
  );
}
