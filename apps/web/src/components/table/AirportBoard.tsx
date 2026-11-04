"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BOARD_AIRPORTS, type AirportBoardResponse } from "@/lib/airport-board";
import { lookupAirport } from "@/lib/airports";
import { formatAge } from "@/lib/freshness";
const text = (value: unknown): string =>
  value == null || value === ""
    ? "Unavailable"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
export function AirportBoard({ iata }: { iata: string }) {
  const airport = lookupAirport(iata);
  const [data, setData] = useState<AirportBoardResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const [direction, setDirection] = useState("scheduled_arrivals");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [day, setDay] = useState("");
  const [sort, setSort] = useState("time");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/airports/${encodeURIComponent(iata)}/board`);
        if (!response.ok) throw new Error("Board unavailable");
        const body = (await response.json()) as AirportBoardResponse;
        if (active) {
          setNow(Date.now());
          setData(body);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 30_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [iata]);
  const days = [...new Set((data?.baselines ?? []).map((b) => b.service_date))].sort().reverse();
  const selectedDay = days.includes(day) ? day : days[0];
  const baseline = data?.baselines.find(
    (b) => b.service_date === selectedDay && b.board === direction
  );
  const time = (value: string | null | undefined) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: airport?.tz ?? "America/New_York",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(value))
      : "Unavailable";
  const rows = useMemo(
    () =>
      (baseline?.flights ?? [])
        .filter(
          (f) =>
            (!status || f.status === status) &&
            (!search ||
              [
                f.flight_icao,
                f.flight_iata,
                f.airline_name,
                f.origin_iata,
                f.destination_iata,
              ].some((v) => v?.toLowerCase().includes(search.toLowerCase())))
        )
        .sort((a, b) =>
          sort === "flight"
            ? a.flight_iata.localeCompare(b.flight_iata)
            : sort === "status"
              ? a.status.localeCompare(b.status)
              : (Date.parse(
                  direction.endsWith("arrivals")
                    ? (a.scheduled_arrival ?? "")
                    : (a.scheduled_departure ?? "")
                ) || 0) -
                (Date.parse(
                  direction.endsWith("arrivals")
                    ? (b.scheduled_arrival ?? "")
                    : (b.scheduled_departure ?? "")
                ) || 0)
        ),
    [baseline, direction, search, status, sort]
  );
  return (
    <section className="space-y-4 p-4 text-gray-200" aria-label={`${iata} airport board`}>
      <h2 className="text-xl font-bold">
        {iata} · {airport?.name ?? "Airport"}
      </h2>
      <nav aria-label="Airport boards" className="flex flex-wrap gap-3">
        {BOARD_AIRPORTS.map((code) => (
          <Link className="text-mia-accent underline" key={code} href={`/airports/${code}`}>
            {code}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-gray-400">
        Morning FlightAware baseline · 04:00–04:00 airport-local service day. Up to 30 flights per
        direction; this is a partial board. Observations do not confirm official times,
        cancellations or gate changes.
      </p>
      {data && !data.supported ? (
        <p>Schedule coverage not enabled for this airport.</p>
      ) : (
        <>
          {failed && (
            <p role="status">
              Airport board unavailable.{" "}
              {data ? "Showing the last downloaded board." : "Retrying automatically."}
            </p>
          )}
          {!data && !failed && <p role="status">Loading airport board…</p>}
          <div className="flex flex-wrap gap-3">
            <div role="group" aria-label="Board direction">
              {[
                ["scheduled_arrivals", "Arrivals"],
                ["scheduled_departures", "Departures"],
              ].map(([value, label]) => (
                <button
                  className="min-h-11 rounded border border-gray-700 px-3 aria-pressed:bg-gray-700"
                  type="button"
                  aria-pressed={direction === value}
                  key={value}
                  onClick={() => setDirection(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Downloaded service day
              <select
                aria-label="Downloaded service day"
                className="block bg-mia-panel p-2"
                value={selectedDay ?? ""}
                onChange={(e) => setDay(e.target.value)}
              >
                {days.map((date) => (
                  <option key={date}>{date}</option>
                ))}
              </select>
            </label>
            <label>
              Search flights
              <input
                className="block w-44 bg-mia-panel p-2"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Provider status
              <select
                className="block bg-mia-panel p-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All</option>
                {[...new Set((baseline?.flights ?? []).map((f) => f.status))].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select
                className="block bg-mia-panel p-2"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="time">Scheduled time</option>
                <option value="flight">Flight</option>
                <option value="status">Provider status</option>
              </select>
            </label>
          </div>
          {baseline && (
            <p className="text-sm text-gray-400">
              Baseline fetched {time(baseline.fetched_at)} (
              {formatAge(now - Date.parse(baseline.fetched_at))})
              {now - Date.parse(baseline.fetched_at) > 26 * 3600_000 ? " · Stale baseline" : ""}
            </p>
          )}
          {data && !rows.length && (
            <p>
              No downloaded flights match this board. Missing flights do not imply cancellation.
            </p>
          )}
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Flight / airline",
                    "Route",
                    "Scheduled",
                    "Estimated / actual",
                    "Provider status",
                    "Observed progress",
                    "Details",
                  ].map((label) => (
                    <th className="p-2" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const p = data?.progress.find(
                    (p) =>
                      p.service_date === selectedDay &&
                      p.board === direction &&
                      p.flight_key === f.id
                  );
                  const age = p ? now - Date.parse(p.observed_at) : Infinity;
                  return (
                    <tr className="border-t border-gray-700 align-top" key={f.id}>
                      <td className="p-2">
                        {f.flight_icao ?? f.flight_iata}
                        <div>{text(f.airline_name ?? f.airline_iata)}</div>
                      </td>
                      <td className="p-2">
                        {text(f.origin_iata)} → {text(f.destination_iata)}
                      </td>
                      <td className="p-2">
                        {time(
                          direction.endsWith("arrivals")
                            ? f.scheduled_arrival
                            : f.scheduled_departure
                        )}
                      </td>
                      <td className="p-2">
                        Estimated:{" "}
                        {time(
                          direction.endsWith("arrivals")
                            ? f.estimated_arrival
                            : String(f.details?.estimated_out ?? "")
                        )}
                        <br />
                        Actual:{" "}
                        {time(
                          direction.endsWith("arrivals") ? f.actual_arrival : f.actual_departure
                        )}
                      </td>
                      <td className="p-2">
                        {text(f.status)}
                        <br />
                        Delay:{" "}
                        {f.delay_minutes == null
                          ? "Unavailable"
                          : `${f.delay_minutes} min (morning report)`}
                      </td>
                      <td className="p-2">
                        {p ? (
                          <>
                            <span className="text-[#39FF14]">
                              {age > 300_000 ? "Last observation: " : "Inferred: "}
                              {p.state}
                            </span>
                            <div>
                              {time(p.observed_at)} · {formatAge(age)}
                            </div>
                          </>
                        ) : (
                          "No receiver observation"
                        )}
                      </td>
                      <td className="p-2">
                        <details>
                          <summary className="cursor-pointer">Flight details</summary>
                          <dl className="min-w-48">
                            {Object.entries({
                              "Departure terminal": f.departure_terminal,
                              "Departure gate": f.departure_gate,
                              "Arrival terminal": f.arrival_terminal,
                              "Arrival gate": f.arrival_gate,
                              Baggage: f.baggage_belt,
                              Aircraft: f.aircraft_icao,
                              Registration: f.aircraft_registration,
                              ...f.details,
                            }).map(([key, value]) => (
                              <div key={key}>
                                <dt className="text-gray-400">{key.replaceAll("_", " ")}</dt>
                                <dd>{text(value)}</dd>
                              </div>
                            ))}
                          </dl>
                          {p?.evidence.latitude != null && p.evidence.longitude != null && (
                            <Link
                              className="text-mia-accent underline"
                              href={`/?flight=${encodeURIComponent(f.flight_icao ?? f.flight_iata)}`}
                            >
                              Locate on map
                            </Link>
                          )}
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
