"use client";

import { useEffect, useRef } from "react";
import { AirlineLogo } from "@/components/ui/AirlineLogo";
import { formatCoords, formatVerticalSpeed } from "@/lib/geo";
import { formatAge, formatMiamiTime } from "@/lib/freshness";
import { PHASE_LABEL } from "@/lib/phase";
import type { Aircraft } from "@/lib/aircraft";

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  aircraft: Aircraft;
  now: number;
  isUpdating: boolean;
  onClose: () => void;
}

/**
 * Selected aircraft. A bottom sheet on phones (at most ~45% of the map, so
 * the aircraft stays visible) and a left sidebar from `sm` up.
 */
export function FlightDetailSidebar({ aircraft: a, now, isUpdating, onClose }: Props) {
  const f = a.flight;
  const closeRef = useRef<HTMLButtonElement>(null);
  const schedule = [
    ["Sched. departure", formatTime(f.scheduled_departure)],
    ["Actual departure", formatTime(f.actual_departure)],
    ["Sched. arrival", formatTime(f.scheduled_arrival)],
    [
      f.actual_arrival ? "Actual arrival" : "ETA",
      formatTime(f.actual_arrival || f.estimated_arrival),
    ],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));

  // Move focus into the panel when a different aircraft is opened.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [f.id]);

  return (
    <aside
      aria-label={`Details for ${a.ident}`}
      className="absolute inset-x-0 bottom-0 z-[1100] max-h-[45%] overflow-y-auto rounded-t-2xl border-t border-gray-700 bg-mia-panel shadow-2xl sm:static sm:z-auto sm:max-h-none sm:w-80 sm:shrink-0 sm:rounded-none sm:border-r sm:border-t-0 sm:shadow-none"
    >
      <div className="sticky top-0 z-10 border-b border-gray-800 bg-mia-panel px-4 py-2">
        <div
          className="mx-auto mb-1 h-1 w-10 rounded-full bg-gray-600 sm:hidden"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <AirlineLogo
              iata={a.operator.airline?.iata ?? null}
              name={a.operator.label}
              size={28}
            />
            <div className="min-w-0">
              <h2 className="truncate font-mono text-xl font-bold text-mia-accent">{a.ident}</h2>
              <p className="truncate text-sm text-gray-300">{a.operator.label}</p>
            </div>
            {isUpdating && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400 motion-safe:animate-ping" />
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-gray-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-mia-accent"
          >
            <svg
              width="20"
              height="20"
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
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-800 bg-mia-dark/50 p-3">
          <Stat
            label="Altitude"
            value={f.altitude_ft === 0 ? "GND" : (f.altitude_ft?.toLocaleString() ?? "—")}
            unit={f.altitude_ft ? "ft" : ""}
          />
          <Stat label="Speed" value={f.ground_speed_knots?.toString() ?? "—"} unit="kt" />
          <Stat
            label="Track"
            value={f.heading != null ? `${Math.round(f.heading)}` : "—"}
            unit="°"
          />
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
          <Field label="Phase (inferred)" value={PHASE_LABEL[a.phase]} />
          <Field label="Vertical rate" value={formatVerticalSpeed(f.vertical_speed_fpm) ?? "—"} />
          <Field
            label="From MIA"
            value={a.distanceKm != null ? `${Math.round(a.distanceKm)} km` : "—"}
          />
          <Field label="ICAO hex" value={a.hex ?? "—"} mono />
          {f.aircraft_icao && <Field label="Aircraft type" value={f.aircraft_icao} />}
          {f.aircraft_registration && (
            <Field label="Registration" value={f.aircraft_registration} mono />
          )}
        </dl>

        {(f.origin_iata || f.destination_iata) && (
          <div className="rounded-lg border border-gray-800 bg-mia-dark/50 p-3">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
              Route (schedule feed)
            </h3>
            <p className="font-mono text-lg font-bold text-gray-100">
              {f.origin_iata ?? "?"} → {f.destination_iata ?? "?"}
            </p>
            {schedule.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {schedule.map(([label, value]) => (
                  <Field key={label} label={label} value={value} />
                ))}
              </dl>
            )}
          </div>
        )}

        <p className="border-t border-gray-800 pt-3 text-xs text-gray-400">
          {formatCoords(f.latitude, f.longitude)} · last heard {formatAge(now - a.updatedAt)} (
          {formatMiamiTime(a.updatedAt)})
        </p>
      </div>
    </aside>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className={`font-medium text-gray-100 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-100">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-gray-400">{unit}</span>}
      </p>
    </div>
  );
}
