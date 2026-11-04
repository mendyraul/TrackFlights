"use client";
import Link from "next/link";
import { useFlights } from "@/hooks/useFlights";
import { formatMiamiTime } from "@/lib/freshness";
export function ScheduleBoard() {
  const { schedules = [] } = useFlights();
  const refreshed = schedules.reduce(
    (latest, f) => Math.max(latest, Date.parse(f.fetched_at ?? "") || 0),
    0
  );
  return (
    <section className="px-4 py-5 sm:px-6" aria-label="MIA schedules">
      <h2 className="text-lg font-semibold">MIA arrivals and departures</h2>
      <p className="my-2 text-sm text-gray-400">
        FlightAware · partial morning board · collected at 04:00 local time. Flights without
        reported positions appear here only.
      </p>
      {refreshed > 0 && (
        <p className="mb-3 text-xs text-gray-400">Last fetched {formatMiamiTime(refreshed)}</p>
      )}
      <p>
        <Link className="text-mia-accent underline" href="/airports/MIA">
          Open airport arrivals and departures
        </Link>
      </p>
      {!schedules.length ? (
        <p className="text-sm text-gray-400">No schedule data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Flight</th>
                <th>Route</th>
                <th>Scheduled (Miami time)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((f) => (
                <tr key={f.id} className="border-t border-gray-800">
                  <td className="py-2">{f.flight_icao ?? f.flight_iata}</td>
                  <td>
                    {f.origin_iata ?? "—"} → {f.destination_iata ?? "—"}
                  </td>
                  <td>
                    {f.scheduled_departure || f.scheduled_arrival
                      ? formatMiamiTime(
                          Date.parse(
                            f.origin_iata === "MIA"
                              ? (f.scheduled_departure || f.scheduled_arrival)!
                              : (f.scheduled_arrival || f.scheduled_departure)!
                          )
                        )
                      : "—"}
                  </td>
                  <td>{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
