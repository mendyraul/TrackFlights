"use client";

import { formatAge, formatMiamiTime, type Freshness } from "@/lib/freshness";
import { CLIENT_POLL_MS } from "@/hooks/useFlights";

interface Props {
  freshness: Freshness;
  dataUpdatedAt: number | null;
  now: number;
  /** What the page is still showing while offline, e.g. "last known positions". */
  showing?: string;
  className?: string;
}

/**
 * Explains stale or missing data instead of an endless spinner or a
 * misleading "Live" badge. Renders nothing while data is live or loading.
 */
export function DataStatusBanner({
  freshness,
  dataUpdatedAt,
  now,
  showing,
  className = "",
}: Props) {
  if (freshness === "live" || freshness === "loading") return null;

  const retry = `Checking again every ${CLIENT_POLL_MS / 1000} s.`;
  let tone = "border-yellow-500/40 bg-yellow-950/90 text-yellow-100";
  let title: string;
  let body: string;

  if (freshness === "silent") {
    title = "Receiver hearing no aircraft";
    body = `The ingestor is running, but the radio isn't reporting any aircraft${
      dataUpdatedAt !== null ? ` (last aircraft ${formatAge(now - dataUpdatedAt)})` : ""
    }. ${retry}`;
  } else if (freshness === "error") {
    tone = "border-red-500/40 bg-red-950/90 text-red-100";
    title = "Can't reach the flight data API";
    body = retry;
  } else if (dataUpdatedAt === null) {
    title = "Receiver offline";
    body = `No aircraft data has been received yet. ${retry}`;
  } else {
    const when = `${formatMiamiTime(dataUpdatedAt)} (${formatAge(now - dataUpdatedAt)})`;
    if (freshness === "delayed") {
      title = "Data delayed";
      body = `Last update ${when}. The receiver may be catching up.`;
    } else {
      title = "Receiver offline";
      body = `Last data received ${when}.${showing ? ` Showing ${showing}.` : ""}`;
    }
  }

  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-2 text-sm shadow-lg backdrop-blur-sm ${tone} ${className}`}
    >
      <span className="font-semibold">{title}</span>
      <span className="opacity-90"> — {body}</span>
    </div>
  );
}
