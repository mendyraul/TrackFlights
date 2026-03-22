"use client";

import type { Flight } from "@/types/database";

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function statusColor(status: Flight["status"]): string {
  const map: Record<string, string> = {
    en_route: "text-blue-400",
    landed: "text-green-400",
    arrived: "text-green-400",
    departed: "text-green-400",
    scheduled: "text-gray-400",
    delayed: "text-yellow-400",
    cancelled: "text-red-400",
    diverted: "text-orange-400",
  };
  return map[status] || "text-gray-500";
}

interface Props {
  flight: Flight;
  onClose: () => void;
}

export function FlightInfoPanel({ flight, onClose }: Props) {
  return (
    <div className="absolute right-4 top-4 z-[1000] w-80 rounded-lg border border-gray-700 bg-mia-panel/95 shadow-xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <div>
          <span className="text-lg font-bold text-mia-accent">
            {flight.flight_iata}
          </span>
          <span className="ml-2 text-sm text-gray-400">
            {flight.airline_name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="space-y-3 p-4 text-sm">
        {/* Route */}
        <div className="flex items-center justify-between">
          <div className="text-center">
            <p className="text-xl font-bold">{flight.origin_iata || "---"}</p>
            <p className="text-xs text-gray-500 truncate max-w-[100px]">
              {flight.origin_name}
            </p>
          </div>
          <div className="flex-1 mx-3 border-t border-dashed border-gray-600 relative">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-mia-panel px-1 text-xs text-gray-500">
              {flight.direction === "arrival" ? "→ MIA" : "MIA →"}
            </span>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold">
              {flight.destination_iata || "---"}
            </p>
            <p className="text-xs text-gray-500 truncate max-w-[100px]">
              {flight.destination_name}
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className={`font-medium uppercase ${statusColor(flight.status)}`}>
            {flight.status.replace("_", " ")}
          </span>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-500">Sched. Departure</p>
            <p>{formatTime(flight.scheduled_departure)}</p>
          </div>
          <div>
            <p className="text-gray-500">Actual Departure</p>
            <p>{formatTime(flight.actual_departure)}</p>
          </div>
          <div>
            <p className="text-gray-500">Sched. Arrival</p>
            <p>{formatTime(flight.scheduled_arrival)}</p>
          </div>
          <div>
            <p className="text-gray-500">
              {flight.actual_arrival ? "Actual Arrival" : "ETA"}
            </p>
            <p>
              {formatTime(flight.actual_arrival || flight.estimated_arrival)}
            </p>
          </div>
        </div>

        {/* Delay */}
        {flight.delay_minutes > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-400">Delay</span>
            <span className="text-yellow-400 font-medium">
              {flight.delay_minutes} min
            </span>
          </div>
        )}

        {/* Position */}
        {flight.latitude && (
          <div className="grid grid-cols-3 gap-2 rounded bg-mia-dark/50 p-2 text-xs">
            <div>
              <p className="text-gray-500">Altitude</p>
              <p>
                {flight.altitude_ft
                  ? `${flight.altitude_ft.toLocaleString()} ft`
                  : "--"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Speed</p>
              <p>
                {flight.ground_speed_knots
                  ? `${flight.ground_speed_knots} kts`
                  : "--"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Heading</p>
              <p>{flight.heading ? `${Math.round(flight.heading)}°` : "--"}</p>
            </div>
          </div>
        )}

        {/* Gate info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {flight.departure_gate && (
            <div>
              <p className="text-gray-500">Dep Gate</p>
              <p>
                {flight.departure_terminal || ""}
                {flight.departure_gate}
              </p>
            </div>
          )}
          {flight.arrival_gate && (
            <div>
              <p className="text-gray-500">Arr Gate</p>
              <p>
                {flight.arrival_terminal || ""}
                {flight.arrival_gate}
              </p>
            </div>
          )}
          {flight.baggage_belt && (
            <div>
              <p className="text-gray-500">Baggage</p>
              <p>Belt {flight.baggage_belt}</p>
            </div>
          )}
        </div>

        {/* Aircraft */}
        {flight.aircraft_icao && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Aircraft: {flight.aircraft_icao}</span>
            {flight.aircraft_registration && (
              <span>{flight.aircraft_registration}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
