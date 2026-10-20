"use client";

import { useMemo, useState } from "react";
import { useFlights } from "@/hooks/useFlights";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";
import { AirlineLogo } from "@/components/ui/AirlineLogo";
import { toAircraft, visibleFlights, type Aircraft } from "@/lib/aircraft";
import { PHASE_LABEL, type FlightPhase } from "@/lib/phase";
import { formatAge } from "@/lib/freshness";
import { formatVerticalSpeed } from "@/lib/geo";

type SortField =
  | "operator"
  | "ident"
  | "phase"
  | "altitude"
  | "speed"
  | "vrate"
  | "distance"
  | "seen";
type SortDir = "asc" | "desc";
type PhaseFilter = FlightPhase | "all";

const PHASE_FILTERS: { value: PhaseFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "arriving", label: "Arriving" },
  { value: "departing", label: "Departing" },
  { value: "overflight", label: "Overflights" },
  { value: "other-airport", label: "Nearby airports" },
  { value: "on-ground", label: "On ground" },
];

const PHASE_STYLE: Record<FlightPhase, string> = {
  arriving: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  departing: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  overflight: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  "other-airport": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "on-ground": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  unknown: "bg-gray-500/10 text-gray-400 border-gray-600/30",
};

const NUMERIC = (n: number | null | undefined) => (n == null ? Number.NEGATIVE_INFINITY : n);

function sortValue(a: Aircraft, field: SortField): string | number {
  const f = a.flight;
  switch (field) {
    case "operator":
      return a.operator.label;
    case "ident":
      return a.ident;
    case "phase":
      return PHASE_LABEL[a.phase];
    case "altitude":
      return NUMERIC(f.altitude_ft);
    case "speed":
      return NUMERIC(f.ground_speed_knots);
    case "vrate":
      return NUMERIC(f.vertical_speed_fpm);
    case "distance":
      return a.distanceKm ?? Number.POSITIVE_INFINITY;
    case "seen":
      return -a.updatedAt;
  }
}

export function FlightBoard() {
  const { flights, loading, freshness, dataUpdatedAt, now, recentlyChanged } = useFlights();
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const [operator, setOperator] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "distance",
    dir: "asc",
  });

  const aircraft = useMemo(
    () => visibleFlights(flights, freshness, now).map(toAircraft),
    // `now` ticks every second; recompute the tracked set at most per snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flights, freshness]
  );

  const operators = useMemo(
    () => [...new Set(aircraft.map((a) => a.operator.label))].sort(),
    [aircraft]
  );

  // Only show schedule columns when some row actually has schedule data
  // (ADS-B never does; the optional AeroAPI feed sometimes does).
  const hasRoutes = aircraft.some((a) => a.flight.origin_iata || a.flight.destination_iata);

  const rows = useMemo(() => {
    const q = search.trim().toUpperCase();
    return aircraft
      .filter((a) => phase === "all" || a.phase === phase)
      .filter((a) => !operator || a.operator.label === operator)
      .filter(
        (a) =>
          !q ||
          a.ident.toUpperCase().includes(q) ||
          (a.hex ?? "").includes(q) ||
          a.operator.label.toUpperCase().includes(q)
      )
      .sort((a, b) => {
        const av = sortValue(a, sort.field);
        const bv = sortValue(b, sort.field);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [aircraft, phase, operator, search, sort]);

  const toggleSort = (field: SortField) =>
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );

  const header = (field: SortField, label: string, align: "left" | "right" = "left") => {
    const active = sort.field === field;
    return (
      <th
        scope="col"
        className={`px-3 py-3 font-medium ${align === "right" ? "text-right" : "text-left"}`}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className="inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mia-accent"
        >
          {label}
          <span aria-hidden="true" className={active ? "text-mia-accent" : "text-gray-600"}>
            {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label="Flight phase"
          className="flex max-w-full overflow-x-auto rounded-lg border border-gray-700"
        >
          {PHASE_FILTERS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={phase === p.value}
              onClick={() => setPhase(p.value)}
              className={`whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${
                phase === p.value
                  ? "bg-mia-accent text-black"
                  : "bg-mia-panel text-gray-300 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Operator
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            // Fixed width: a select sizes to its longest option, so it would
            // widen when the data arrives and push the row (layout shift).
            className="w-56 rounded-lg border border-gray-700 bg-mia-panel px-3 py-2 text-sm text-gray-200"
          >
            <option value="">All operators</option>
            {operators.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Search
          <input
            type="search"
            placeholder="Callsign, hex or airline"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 rounded-lg border border-gray-700 bg-mia-panel px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-mia-accent focus:outline-none"
          />
        </label>

        <p className="ml-auto text-xs text-gray-400" aria-live="polite">
          {loading ? "Loading aircraft…" : `${rows.length} of ${aircraft.length} aircraft`}
        </p>
      </div>

      <DataStatusBanner
        freshness={freshness}
        dataUpdatedAt={dataUpdatedAt}
        now={now}
        showing="the last aircraft seen"
        variant="toast"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full min-w-[60rem] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <caption className="sr-only">
            Aircraft heard by the receiver, with phase inferred from altitude, vertical rate, track
            and distance to MIA
          </caption>
          <thead className="bg-mia-panel text-xs text-gray-400">
            <tr>
              {header("operator", "Operator")}
              {header("ident", "Callsign")}
              <th scope="col" className="px-3 py-3 text-left font-medium uppercase tracking-wider">
                ICAO hex
              </th>
              {header("phase", "Phase")}
              {hasRoutes && (
                <th
                  scope="col"
                  className="px-3 py-3 text-left font-medium uppercase tracking-wider"
                >
                  Route
                </th>
              )}
              {header("altitude", "Altitude", "right")}
              {header("speed", "Speed", "right")}
              <th scope="col" className="px-3 py-3 text-right font-medium uppercase tracking-wider">
                Track
              </th>
              {header("vrate", "V/S", "right")}
              {header("distance", "From MIA", "right")}
              {header("seen", "Last seen", "right")}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {loading &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={`skeleton-${i}`} aria-hidden="true">
                  <td colSpan={hasRoutes ? 11 : 10} className="px-3 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-gray-800/70" />
                  </td>
                </tr>
              ))}
            {rows.map((a) => {
              const f = a.flight;
              const changed = recentlyChanged.has(f.id);
              return (
                <tr
                  key={f.id}
                  className={`transition-colors duration-700 ${
                    changed ? "bg-mia-accent/5" : "hover:bg-gray-800/30"
                  }`}
                >
                  <td className="px-3 py-2.5 text-gray-200">
                    <div className="flex items-center gap-2">
                      <AirlineLogo
                        decorative
                        iata={a.operator.airline?.iata ?? null}
                        name={a.operator.label}
                        size={20}
                      />
                      <span className="max-w-[14rem] truncate">{a.operator.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-white">
                    {a.callsign ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-300">{a.hex ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${PHASE_STYLE[a.phase]}`}
                    >
                      {PHASE_LABEL[a.phase]}
                    </span>
                  </td>
                  {hasRoutes && (
                    <td className="px-3 py-2.5 font-mono text-gray-300">
                      {f.origin_iata || f.destination_iata
                        ? `${f.origin_iata ?? "?"} → ${f.destination_iata ?? "?"}`
                        : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-200">
                    {f.altitude_ft === 0
                      ? "GND"
                      : f.altitude_ft != null
                        ? `${f.altitude_ft.toLocaleString()} ft`
                        : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-200">
                    {f.ground_speed_knots != null ? `${f.ground_speed_knots} kt` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-300">
                    {f.heading != null ? `${Math.round(f.heading)}°` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-300">
                    {formatVerticalSpeed(f.vertical_speed_fpm) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-200">
                    {a.distanceKm != null ? `${Math.round(a.distanceKm)} km` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-400">
                    {formatAge(now - a.updatedAt)}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={hasRoutes ? 11 : 10} className="px-4 py-12 text-center text-gray-400">
                  {aircraft.length > 0
                    ? "No aircraft match these filters."
                    : "No aircraft in range right now."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        {aircraft.some((a) => a.phaseFromModel)
          ? "Phase comes from a classifier trained on this receiver's own tracks (labels from where each aircraft actually landed or took off), which can tell MIA traffic from nearby fields."
          : "Phase is inferred from altitude, vertical rate, track and distance to MIA. Without a flight plan, an aircraft descending into Fort Lauderdale can still show as arriving."}
      </p>
    </div>
  );
}
