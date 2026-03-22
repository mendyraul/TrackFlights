"use client";

import { useState, useMemo } from "react";
import { useFlights } from "@/hooks/useFlights";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import type { Flight, FlightDirection, FlightStatus } from "@/types/database";

type SortField =
  | "flight_iata"
  | "airline_name"
  | "route"
  | "scheduled"
  | "estimated"
  | "status"
  | "gate";
type SortDir = "asc" | "desc";

const ALL_STATUSES: { value: FlightStatus | ""; label: string }[] = [
  { value: "", label: "Any Status" },
  { value: "scheduled", label: "Scheduled" },
  { value: "en_route", label: "En Route" },
  { value: "landed", label: "Landed" },
  { value: "departed", label: "Departed" },
  { value: "delayed", label: "Delayed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "diverted", label: "Diverted" },
];

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
    en_route: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    landed: "bg-green-500/20 text-green-400 border-green-500/30",
    arrived: "bg-green-500/20 text-green-400 border-green-500/30",
    departed: "bg-green-500/20 text-green-400 border-green-500/30",
    scheduled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    delayed: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    diverted: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    unknown: "bg-gray-500/20 text-gray-500 border-gray-500/30",
  };

  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${colors[status] || colors.unknown}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function getSortValue(
  flight: Flight,
  field: SortField,
  direction: FlightDirection
): string {
  switch (field) {
    case "flight_iata":
      return flight.flight_iata;
    case "airline_name":
      return flight.airline_name || "";
    case "route":
      return direction === "arrival"
        ? flight.origin_iata || ""
        : flight.destination_iata || "";
    case "scheduled":
      return (
        (direction === "arrival"
          ? flight.scheduled_arrival
          : flight.scheduled_departure) || ""
      );
    case "estimated":
      return (
        (direction === "arrival"
          ? flight.estimated_arrival || flight.actual_arrival
          : flight.actual_departure) || ""
      );
    case "status":
      return flight.status;
    case "gate":
      return (
        (direction === "arrival"
          ? flight.arrival_gate
          : flight.departure_gate) || ""
      );
    default:
      return "";
  }
}

export function FlightBoard() {
  const {
    flights,
    loading,
    error,
    connectionStatus,
    lastUpdate,
    recentlyChanged,
  } = useFlights();
  const [direction, setDirection] = useState<FlightDirection>("arrival");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FlightStatus | "">("");
  const [airlineFilter, setAirlineFilter] = useState("");
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "scheduled",
    dir: "asc",
  });

  const toggleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  };

  const sortIndicator = (field: SortField) => {
    if (sort.field !== field)
      return <span className="ml-1 text-gray-600">↕</span>;
    return (
      <span className="ml-1 text-mia-accent">
        {sort.dir === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  // Unique airlines for filter
  const airlines = useMemo(() => {
    const codes = new Set<string>();
    for (const f of flights) {
      if (f.airline_iata) codes.add(f.airline_iata);
    }
    return [...codes].sort();
  }, [flights]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return flights
      .filter((f) => f.direction === direction)
      .filter((f) => !statusFilter || f.status === statusFilter)
      .filter((f) => !airlineFilter || f.airline_iata === airlineFilter)
      .filter(
        (f) =>
          !q ||
          f.flight_iata.toLowerCase().includes(q) ||
          f.airline_name?.toLowerCase().includes(q) ||
          f.origin_iata?.toLowerCase().includes(q) ||
          f.destination_iata?.toLowerCase().includes(q) ||
          f.origin_name?.toLowerCase().includes(q) ||
          f.destination_name?.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aVal = getSortValue(a, sort.field, direction);
        const bVal = getSortValue(b, sort.field, direction);
        const cmp = aVal.localeCompare(bVal);
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [flights, direction, search, statusFilter, airlineFilter, sort]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-mia-accent border-t-transparent" />
          <p className="text-gray-400">Loading flight board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Board header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Direction toggle */}
        <div className="flex overflow-hidden rounded-lg border border-gray-700">
          {(["arrival", "departure"] as FlightDirection[]).map((dir) => (
            <button
              key={dir}
              onClick={() => setDirection(dir)}
              className={`px-5 py-2.5 text-sm font-semibold uppercase tracking-wider transition-colors ${
                direction === dir
                  ? "bg-mia-accent text-black"
                  : "bg-mia-panel text-gray-400 hover:text-white"
              }`}
            >
              {dir}s
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FlightStatus | "")}
          className="rounded-lg border border-gray-700 bg-mia-panel px-3 py-2.5 text-sm text-gray-200"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Airline filter */}
        <select
          value={airlineFilter}
          onChange={(e) => setAirlineFilter(e.target.value)}
          className="rounded-lg border border-gray-700 bg-mia-panel px-3 py-2.5 text-sm text-gray-200"
        >
          <option value="">All Airlines</option>
          {airlines.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search flight, airline, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-lg border border-gray-700 bg-mia-panel pl-9 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-mia-accent focus:outline-none"
          />
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Connection status + count */}
        <div className="ml-auto flex items-center gap-3">
          <ConnectionBadge status={connectionStatus} lastUpdate={lastUpdate} />
          <span className="rounded bg-mia-dark px-2.5 py-1 text-xs font-medium text-gray-400">
            {filtered.length} flights
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded bg-red-900/20 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-mia-panel text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th
                className="cursor-pointer px-4 py-3 text-left hover:text-gray-200"
                onClick={() => toggleSort("airline_name")}
              >
                Airline {sortIndicator("airline_name")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left hover:text-gray-200"
                onClick={() => toggleSort("flight_iata")}
              >
                Flight {sortIndicator("flight_iata")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left hover:text-gray-200"
                onClick={() => toggleSort("route")}
              >
                {direction === "arrival" ? "Origin" : "Destination"}{" "}
                {sortIndicator("route")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left hover:text-gray-200"
                onClick={() => toggleSort("scheduled")}
              >
                Scheduled {sortIndicator("scheduled")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left hover:text-gray-200"
                onClick={() => toggleSort("estimated")}
              >
                {direction === "arrival" ? "ETA" : "Actual"}{" "}
                {sortIndicator("estimated")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left hover:text-gray-200"
                onClick={() => toggleSort("status")}
              >
                Status {sortIndicator("status")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left hover:text-gray-200"
                onClick={() => toggleSort("gate")}
              >
                Gate {sortIndicator("gate")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filtered.map((flight) => {
              const isChanged = recentlyChanged.has(flight.id);
              return (
                <tr
                  key={flight.id}
                  className={`transition-all duration-700 ${
                    isChanged
                      ? "bg-mia-accent/5 ring-1 ring-inset ring-mia-accent/20"
                      : "hover:bg-gray-800/30"
                  }`}
                >
                  <td className="px-4 py-3 text-gray-300">
                    <span className="mr-1.5 font-mono text-xs text-mia-accent">
                      {flight.airline_iata}
                    </span>
                    {flight.airline_name || "--"}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-white">
                    {flight.flight_iata}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium">
                      {direction === "arrival"
                        ? flight.origin_iata || "--"
                        : flight.destination_iata || "--"}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      {direction === "arrival"
                        ? flight.origin_name
                        : flight.destination_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatTime(
                      direction === "arrival"
                        ? flight.scheduled_arrival
                        : flight.scheduled_departure
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {direction === "arrival"
                      ? formatTime(
                          flight.estimated_arrival || flight.actual_arrival
                        )
                      : formatTime(flight.actual_departure)}
                    {flight.delay_minutes > 0 && (
                      <span className="ml-1.5 text-xs text-yellow-400">
                        +{flight.delay_minutes}m
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{statusBadge(flight.status)}</td>
                  <td className="px-4 py-3 font-mono text-gray-300">
                    {(direction === "arrival"
                      ? flight.arrival_gate
                      : flight.departure_gate) || "--"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  {search || statusFilter || airlineFilter
                    ? "No flights match your filters"
                    : "No flights found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
