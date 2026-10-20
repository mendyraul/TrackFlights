"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Flight } from "@/types/database";
import type { ConnectionStatus } from "@/services/realtime";
import { logger } from "@/lib/logger";
import {
  classifyFreshness,
  newestUpdate,
  type Freshness,
  type ReceiverStatus,
} from "@/lib/freshness";

// Every component that needs flights (header status, map, board, analytics)
// shares one poller, so a page never fetches the snapshot more than once per
// interval.
//
// The route is CDN-cached for 30 s (SNAPSHOT_REFRESH_SECONDS). Polling at half
// that window means a fresh snapshot shows up at most ~15 s after the CDN
// refreshes, and only every other poll repeats data, where a 10 s poll
// repeated two out of three. Repeat polls are CDN hits, not Supabase reads.
const SNAPSHOT_URL = "/api/flights/snapshot";
export const CLIENT_POLL_MS = 15_000;
const HIGHLIGHT_MS = 2_500;

interface SnapshotState {
  flights: Flight[];
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  /** When the browser last received a snapshot (epoch ms). */
  lastUpdate: number | null;
  /** Newest aircraft `updated_at` in the snapshot (epoch ms): the real data age. */
  dataUpdatedAt: number | null;
  /** IDs whose row changed since the previous snapshot (for highlight animations). */
  recentlyChanged: Set<string>;
  /** Ingestor heartbeat, once the heartbeat migration is applied. */
  receiver: ReceiverStatus | null;
}

const initialState: SnapshotState = {
  flights: [],
  loading: true,
  error: null,
  connectionStatus: "disconnected",
  lastUpdate: null,
  dataUpdatedAt: null,
  recentlyChanged: new Set(),
  receiver: null,
};

let state: SnapshotState = initialState;
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

function setState(patch: Partial<SnapshotState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

async function fetchSnapshot() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  try {
    const resp = await fetch(SNAPSHOT_URL);
    if (!resp.ok) {
      throw new Error(`snapshot request failed (${resp.status})`);
    }
    const body = (await resp.json()) as {
      flights?: Flight[];
      dataUpdatedAt?: string | null;
      receiver?: ReceiverStatus | null;
    };
    const flights = body.flights ?? [];

    const previous = new Map(state.flights.map((f) => [f.id, f.updated_at]));
    const changed = new Set(
      previous.size === 0
        ? []
        : flights.filter((f) => previous.get(f.id) !== f.updated_at).map((f) => f.id)
    );

    const fromServer = body.dataUpdatedAt ? Date.parse(body.dataUpdatedAt) : NaN;
    setState({
      flights,
      loading: false,
      error: null,
      connectionStatus: "connected",
      lastUpdate: Date.now(),
      dataUpdatedAt: Number.isFinite(fromServer) ? fromServer : newestUpdate(flights),
      recentlyChanged: changed,
      receiver: body.receiver ?? null,
    });

    if (changed.size > 0) {
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => setState({ recentlyChanged: new Set() }), HIGHLIGHT_MS);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "snapshot fetch failed";
    logger.error("flight snapshot fetch failed", { error: message });
    setState({ loading: false, error: message, connectionStatus: "disconnected" });
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") void fetchSnapshot();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void fetchSnapshot();
    interval = setInterval(fetchSnapshot, CLIENT_POLL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (interval) clearInterval(interval);
      interval = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/** Test hook: drop shared state between test cases. */
export function resetFlightSnapshotStore() {
  if (interval) clearInterval(interval);
  if (highlightTimer) clearTimeout(highlightTimer);
  interval = null;
  highlightTimer = null;
  listeners.clear();
  state = initialState;
}

export interface UseFlightsReturn extends SnapshotState {
  freshness: Freshness;
  /** Current time, re-rendered every second so "Xs ago" labels tick. */
  now: number;
}

export function useFlights(): UseFlightsReturn {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => initialState
  );
  const now = useNow();
  const freshness = classifyFreshness({
    loading: snapshot.loading,
    error: snapshot.error,
    dataUpdatedAt: snapshot.dataUpdatedAt,
    receiver: snapshot.receiver,
    now,
  });
  return { ...snapshot, freshness, now };
}

function useNow(stepMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}
