/**
 * Data freshness: how old is the newest aircraft position we have?
 *
 * A successful fetch only proves the API answered. The receiver can be down
 * while the API happily serves rows from hours (or months) ago, so every
 * "live" claim in the UI is derived from the newest row's `updated_at`, not
 * from when the browser last fetched.
 */

/** Newest data younger than this is "live". The Pi writes every ~15 s and the CDN caches 30 s. */
export const LIVE_MAX_AGE_MS = 2 * 60_000;
/** Between live and this, data is "delayed"; older than this the receiver is treated as offline. */
export const OFFLINE_AFTER_MS = 15 * 60_000;
/** An aircraft counts as currently tracked if its row was updated within this window. */
export const TRACKED_WINDOW_MS = 5 * 60_000;

/** How long a heartbeat counts as current. The ingestor writes one every ~15 s. */
export const HEARTBEAT_MAX_AGE_MS = 2 * 60_000;

/**
 * "silent": the ingestor is polling (fresh heartbeat) but the decoder reports
 * no aircraft at all, i.e. the radio side (antenna, SDR, readsb) is the problem.
 */
export type Freshness = "loading" | "live" | "delayed" | "silent" | "offline" | "error";

/** The ingestor's last poll, from ingestor_heartbeat via the snapshot route. */
export interface ReceiverStatus {
  lastPollAt: string;
  received: number;
  inRange: number;
}

interface HasUpdatedAt {
  updated_at: string;
}

/** Newest `updated_at` across rows, as epoch ms, or null when there are none. */
export function newestUpdate(rows: readonly HasUpdatedAt[]): number | null {
  let newest: number | null = null;
  for (const row of rows) {
    const t = Date.parse(row.updated_at);
    if (Number.isFinite(t) && (newest === null || t > newest)) newest = t;
  }
  return newest;
}

export function classifyFreshness(args: {
  loading: boolean;
  error: string | null;
  dataUpdatedAt: number | null;
  now: number;
  receiver?: ReceiverStatus | null;
}): Freshness {
  const { loading, error, dataUpdatedAt, now, receiver } = args;
  if (loading) return "loading";

  // A fresh heartbeat is the best signal: the ingestor ran in the last couple
  // of minutes. It is only present once the heartbeat migration is applied;
  // otherwise fall back to the newest row's age.
  if (receiver) {
    const beat = Date.parse(receiver.lastPollAt);
    if (Number.isFinite(beat) && now - beat <= HEARTBEAT_MAX_AGE_MS) {
      return receiver.received > 0 ? "live" : "silent";
    }
  }

  if (dataUpdatedAt === null) return error ? "error" : "offline";
  const age = now - dataUpdatedAt;
  if (age <= LIVE_MAX_AGE_MS) return "live";
  if (age <= OFFLINE_AFTER_MS) return "delayed";
  return "offline";
}

/** Rows updated within the tracked window, i.e. aircraft the receiver is hearing right now. */
export function trackedNow<T extends HasUpdatedAt>(rows: readonly T[], now: number): T[] {
  return rows.filter((row) => now - Date.parse(row.updated_at) <= TRACKED_WINDOW_MS);
}

/** "12s ago", "4m ago", "3h ago", "92d ago". */
export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Absolute timestamp in Miami time, e.g. "Jul 19, 7:00 AM EDT". */
export function formatMiamiTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
