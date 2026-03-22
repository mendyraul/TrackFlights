"use client";

import { useState } from "react";
import { useFlights } from "@/hooks/useFlights";
import type { Flight, FlightDirection } from "@/types/database";

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function statusBadge(status: Flight["status"]) {
  const colors: Record<string, string> = {
    en_route: "bg-blue-500/20 text-blue-400",
    landed: "bg-green-500/20 text-green-400",
    arrived: "bg-green-500/20 text-green-400",
    departed: "bg-green-500/20 text-green-400",
    scheduled: "bg-gray-500/20 text-gray-400",
    delayed: "bg-yellow-500/20 text-yellow-400",
    cancelled: "bg-red-500/20 text-red-400",
    diverted: "bg-orange-500/20 text-orange-400",
    unknown: "bg-gray-500/20 text-gray-500",
  };

  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${colors[status] || colors.unknown}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function FlightBoard() {
  const { flights, loading, error } = useFlights();
  const [direction, setDirection] = useState<FlightDirection>("arrival");
  const [search, setSearch] = useState("");

  const filtered = flights
    .filter((f) => f.direction === direction)
    .filter(
      (f) =>
        !search ||
        f.flight_iata.toLowerCase().includes(search.toLowerCase()) ||
        f.airline_name?.toLowerCase().includes(search.toLowerCase()) ||
        f.origin_iata?.toLowerCase().includes(search.toLowerCase()) ||
        f.destination_iata?.toLowerCase().includes(search.toLowerCase())
    );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-400">Loading flight board...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Controls */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          {(["arrival", "departure"] as FlightDirection[]).map((dir) => (
            <button
              key={dir}
              onClick={() => setDirection(dir)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                direction === dir
                  ? "bg-mia-accent text-black"
                  : "bg-mia-panel text-gray-400 hover:text-white"
              }`}
            >
              {dir}s
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search flights..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-700 bg-mia-panel px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-mia-accent focus:outline-none"
        />
        <span className="ml-auto text-sm text-gray-500">
          {filtered.length} flights
        </span>
      </div>

      {error && <p className="mb-4 text-red-400 text-sm">Error: {error}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-mia-panel text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">Flight</th>
              <th className="px-4 py-3 text-left">Airline</th>
              <th className="px-4 py-3 text-left">
                {direction === "arrival" ? "Origin" : "Destination"}
              </th>
              <th className="px-4 py-3 text-left">Scheduled</th>
              <th className="px-4 py-3 text-left">
                {direction === "arrival" ? "ETA" : "Actual"}
              </th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Gate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((flight) => (
              <tr
                key={flight.id}
                className="hover:bg-gray-800/50 transition-colors"
              >
                <td className="px-4 py-3 font-mono font-medium text-mia-accent">
                  {flight.flight_iata}
                </td>
                <td className="px-4 py-3">{flight.airline_name || "--"}</td>
                <td className="px-4 py-3 font-mono">
                  {direction === "arrival"
                    ? flight.origin_iata || "--"
                    : flight.destination_iata || "--"}
                </td>
                <td className="px-4 py-3">
                  {formatTime(
                    direction === "arrival"
                      ? flight.scheduled_arrival
                      : flight.scheduled_departure
                  )}
                </td>
                <td className="px-4 py-3">
                  {direction === "arrival"
                    ? formatTime(
                        flight.estimated_arrival || flight.actual_arrival
                      )
                    : formatTime(flight.actual_departure)}
                </td>
                <td className="px-4 py-3">{statusBadge(flight.status)}</td>
                <td className="px-4 py-3 font-mono">
                  {(direction === "arrival"
                    ? flight.arrival_gate
                    : flight.departure_gate) || "--"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No flights found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
