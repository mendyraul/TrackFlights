"use client";

import { useState } from "react";
import { formatAge, formatMiamiTime, type Freshness } from "@/lib/freshness";
import { CLIENT_POLL_MS } from "@/hooks/useFlights";

interface Props {
  freshness: Freshness;
  dataUpdatedAt: number | null;
  now: number;
  /** What the page is still showing while offline, e.g. "last known positions". */
  showing?: string;
  className?: string;
  /**
   * "toast": pinned to the bottom of the viewport with a dismiss button.
   * It appears after data loads, so an inline banner would push the page
   * down (a layout shift); a fixed toast doesn't. The header keeps showing
   * the receiver state after it's dismissed.
   */
  variant?: "inline" | "toast";
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
  variant = "inline",
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (freshness === "live" || freshness === "loading" || dismissed) return null;

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

  const message = (
    <p>
      <span className="font-semibold">{title}</span>
      <span className="opacity-90"> — {body}</span>
    </p>
  );

  if (variant === "toast") {
    return (
      <div
        role="status"
        className={`fixed inset-x-3 bottom-3 z-[1500] mx-auto flex max-w-2xl items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur-sm ${tone} ${className}`}
      >
        <div className="flex-1">{message}</div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="-my-1 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-80 hover:bg-white/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-2 text-sm shadow-lg backdrop-blur-sm ${tone} ${className}`}
    >
      {message}
    </div>
  );
}
