"use client";
import { LAST_SEEN_COLOR, formatAge, isLastSeen } from "@/lib/freshness";
export type SourceFilterValue = "all" | "adsb1090" | "flightaware";
export function SourceFilter({
  value,
  onChange,
}: {
  value: SourceFilterValue;
  onChange: (value: SourceFilterValue) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-400">
      Source
      <select
        className="rounded border border-gray-700 bg-mia-panel px-2 py-2 text-sm text-gray-200"
        value={value}
        onChange={(e) => onChange(e.target.value as SourceFilterValue)}
      >
        <option value="all">All sources</option>
        <option value="adsb1090">My receiver</option>
        <option value="flightaware">FlightAware</option>
      </select>
    </label>
  );
}
export function SourceLabel({
  source,
  updatedAt,
  now,
}: {
  source?: string;
  /** With `now`, receiver rows older than the tracked window read "last seen". */
  updatedAt?: string;
  now?: number;
}) {
  if (
    updatedAt !== undefined &&
    now !== undefined &&
    isLastSeen({ data_source: source, updated_at: updatedAt }, now)
  ) {
    return (
      <span style={{ color: LAST_SEEN_COLOR }}>
        My receiver · last seen {formatAge(now - Date.parse(updatedAt))}
      </span>
    );
  }
  return (
    <span className={source === "flightaware" ? "text-[#FFFF00]" : "text-[#39FF14]"}>
      {source === "flightaware" ? "FlightAware snapshot" : "My receiver"}
    </span>
  );
}
