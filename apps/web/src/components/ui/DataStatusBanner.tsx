"use client";

import { type Freshness } from "@/lib/freshness";
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
export function DataStatusBanner({ freshness, className = "" }: Props) {
  if (freshness === "live" || freshness === "loading") return null;

  const retry = `Checking again every ${CLIENT_POLL_MS / 1000} s.`;
  let tone = "border-yellow-500/40 bg-yellow-950/90 text-yellow-100";
  let title: string;
  let body: string;

  if (freshness === "silent") {
    title = "No aircraft in range";
    body = `No aircraft are currently in range. ${retry}`;
  } else if (freshness === "delayed") {
    title = "Flight data is delayed";
    body = "Please try again shortly.";
  } else {
    tone = "border-red-500/40 bg-red-950/90 text-red-100";
    title = "Flight data is temporarily unavailable";
    body = "Please try again shortly.";
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
