"use client";

import { useFlights } from "@/hooks/useFlights";
import { formatAge, trackedNow, type Freshness } from "@/lib/freshness";

const LABEL: Record<Freshness, { text: string; dot: string; pulse: boolean }> = {
  loading: { text: "Connecting", dot: "bg-gray-400", pulse: true },
  live: { text: "Receiver online", dot: "bg-green-400", pulse: true },
  delayed: { text: "Data delayed", dot: "bg-yellow-400", pulse: false },
  offline: { text: "Receiver offline", dot: "bg-red-400", pulse: false },
  error: { text: "API unreachable", dot: "bg-red-400", pulse: false },
};

/** Header indicator: receiver state, aircraft tracked right now, and data age. */
export function LiveStatus() {
  const { flights, freshness, dataUpdatedAt, now } = useFlights();
  const cfg = LABEL[freshness];
  const tracked = trackedNow(flights, now).length;

  return (
    <div className="flex items-center gap-2 text-xs" data-testid="live-status">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot} ${cfg.pulse ? "motion-safe:animate-pulse" : ""}`}
      />
      <span role="status" className="font-medium text-gray-200">
        {cfg.text}
        {freshness === "live" || freshness === "delayed" ? (
          <span className="font-normal text-gray-400"> · {tracked} aircraft</span>
        ) : null}
      </span>
      {dataUpdatedAt !== null && freshness !== "loading" ? (
        <span className="hidden text-gray-400 sm:inline">
          · updated {formatAge(now - dataUpdatedAt)}
        </span>
      ) : null}
    </div>
  );
}
