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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
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

function statusBg(status: Flight["status"]): string {
  const map: Record<string, string> = {
    en_route: "bg-blue-500/10 border-blue-500/30",
    landed: "bg-green-500/10 border-green-500/30",
    arrived: "bg-green-500/10 border-green-500/30",
    departed: "bg-green-500/10 border-green-500/30",
    scheduled: "bg-gray-500/10 border-gray-500/30",
    delayed: "bg-yellow-500/10 border-yellow-500/30",
    cancelled: "bg-red-500/10 border-red-500/30",
    diverted: "bg-orange-500/10 border-orange-500/30",
  };
  return map[status] || "bg-gray-500/10 border-gray-500/30";
}

interface Props {
  flight: Flight;
  isUpdating: boolean;
  onClose: () => void;
}

export function FlightDetailSidebar({ flight, isUpdating, onClose }: Props) {
  return (
    <div className="w-80 shrink-0 border-r border-gray-800 bg-mia-panel overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-800 bg-mia-panel px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-mia-accent">
              {flight.flight_iata}
            </span>
            {isUpdating && (
              <span className="h-2 w-2 rounded-full bg-orange-400 animate-ping" />
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mt-0.5 text-sm text-gray-400">{flight.airline_name}</p>
      </div>

      <div className="space-y-4 p-4">
        {/* Status */}
        <div
          className={`rounded-lg border p-3 text-center ${statusBg(flight.status)}`}
        >
          <span
            className={`text-sm font-semibold uppercase tracking-wider ${statusColor(flight.status)}`}
          >
            {flight.status.replace("_", " ")}
          </span>
          {flight.delay_minutes > 0 && (
            <span className="ml-2 text-sm text-yellow-400">
              (+{flight.delay_minutes} min delay)
            </span>
          )}
        </div>

        {/* Route */}
        <div className="rounded-lg border border-gray-800 bg-mia-dark/50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <p className="text-2xl font-bold">{flight.origin_iata || "---"}</p>
              <p className="mt-0.5 text-xs text-gray-500 max-w-[90px] truncate">
                {flight.origin_name}
              </p>
            </div>
            <div className="flex-1 mx-4">
              <div className="relative border-t border-dashed border-gray-600">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-mia-dark/50 px-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#6b7280">
                    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">
                {flight.destination_iata || "---"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 max-w-[90px] truncate">
                {flight.destination_name}
              </p>
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
            Schedule
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoField
              label="Sched. Departure"
              value={formatTime(flight.scheduled_departure)}
              sub={formatDate(flight.scheduled_departure)}
            />
            <InfoField
              label="Actual Departure"
              value={formatTime(flight.actual_departure)}
            />
            <InfoField
              label="Sched. Arrival"
              value={formatTime(flight.scheduled_arrival)}
              sub={formatDate(flight.scheduled_arrival)}
            />
            <InfoField
              label={flight.actual_arrival ? "Actual Arrival" : "ETA"}
              value={formatTime(
                flight.actual_arrival || flight.estimated_arrival
              )}
            />
          </div>
        </div>

        {/* Position */}
        {flight.latitude && (
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
              Position
            </h4>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-800 bg-mia-dark/50 p-3">
              <PositionField
                label="Altitude"
                value={
                  flight.altitude_ft
                    ? `${flight.altitude_ft.toLocaleString()}`
                    : "--"
                }
                unit="ft"
              />
              <PositionField
                label="Speed"
                value={flight.ground_speed_knots?.toString() || "--"}
                unit="kts"
              />
              <PositionField
                label="Heading"
                value={
                  flight.heading != null
                    ? `${Math.round(flight.heading)}`
                    : "--"
                }
                unit="°"
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-600">
              <span>
                {flight.latitude.toFixed(4)}°N, {flight.longitude?.toFixed(4)}°W
              </span>
              {flight.vertical_speed_fpm != null && (
                <span>
                  {flight.vertical_speed_fpm > 0 ? "↑" : "↓"}{" "}
                  {Math.abs(flight.vertical_speed_fpm)} fpm
                </span>
              )}
            </div>
          </div>
        )}

        {/* Gate & Terminal */}
        {(flight.departure_gate ||
          flight.arrival_gate ||
          flight.baggage_belt) && (
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
              Gate Information
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {flight.departure_gate && (
                <InfoField
                  label="Departure Gate"
                  value={`${flight.departure_terminal || ""}${flight.departure_gate}`}
                />
              )}
              {flight.arrival_gate && (
                <InfoField
                  label="Arrival Gate"
                  value={`${flight.arrival_terminal || ""}${flight.arrival_gate}`}
                />
              )}
              {flight.baggage_belt && (
                <InfoField
                  label="Baggage Belt"
                  value={`Belt ${flight.baggage_belt}`}
                />
              )}
            </div>
          </div>
        )}

        {/* Aircraft */}
        {flight.aircraft_icao && (
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
              Aircraft
            </h4>
            <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-mia-dark/50 px-3 py-2 text-sm">
              <span className="text-gray-300">{flight.aircraft_icao}</span>
              {flight.aircraft_registration && (
                <span className="font-mono text-gray-500">
                  {flight.aircraft_registration}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Last updated */}
        <div className="border-t border-gray-800 pt-3 text-xs text-gray-600">
          Last updated:{" "}
          {new Date(flight.updated_at).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

function InfoField({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium">{value}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

function PositionField({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-200">
        {value}
        <span className="ml-0.5 text-xs font-normal text-gray-500">{unit}</span>
      </p>
    </div>
  );
}
