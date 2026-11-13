import type { Flight } from "@/types/database";
import { LAST_SEEN_COLOR, formatAge, formatMiamiTime, isLastSeen } from "@/lib/freshness";
export function SourceSummary({ flights, now }: { flights: Flight[]; now: number }) {
  const receiver = flights.filter((f) => f.data_source !== "flightaware");
  const lastSeen = receiver.filter((f) => isLastSeen(f, now));
  const local = receiver.filter((f) => !isLastSeen(f, now));
  const remote = flights.filter((f) => f.data_source === "flightaware");
  const captured = remote.reduce(
    (latest, f) => Math.max(latest, Date.parse(f.fetched_at ?? f.updated_at) || 0),
    0
  );
  return (
    <p className="rounded bg-mia-panel/95 px-3 py-2 text-xs text-gray-300">
      <span className="text-[#39FF14]">● My receiver: {local.length}</span> ·{" "}
      <span className="text-[#FFFF00]">● FlightAware snapshot: {remote.length}</span>
      {lastSeen.length > 0 && (
        <>
          {" "}
          ·{" "}
          <span style={{ color: LAST_SEEN_COLOR }}>
            ● Last seen by my receiver: {lastSeen.length}
          </span>
        </>
      )}
      {captured > 0 && (
        <span className="block">
          Captured {formatMiamiTime(captured)} ({formatAge(now - captured)}) · historical positions,
          refreshed daily
        </span>
      )}
    </p>
  );
}
