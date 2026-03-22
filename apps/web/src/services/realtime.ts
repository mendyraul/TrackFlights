/**
 * Supabase Realtime subscription service.
 *
 * Manages a single subscription to `flights_current` with:
 * - Connection state tracking (connected / connecting / disconnected)
 * - Automatic reconnection with exponential back-off
 * - Update batching to prevent UI thrashing during bursts
 * - Typed event callbacks for INSERT / UPDATE / DELETE
 */

import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Flight } from "@/types/database";

// ── Types ───────────────────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

export interface RealtimeEvent {
  type: "INSERT" | "UPDATE" | "DELETE";
  flight: Flight;
  old?: Partial<Flight>;
  timestamp: number;
}

export interface RealtimeCallbacks {
  onEvent: (events: RealtimeEvent[]) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

// ── Config ──────────────────────────────────────────────────────────────

const BATCH_INTERVAL_MS = 200; // flush batched events every 200ms
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

// ── Service ─────────────────────────────────────────────────────────────

export class FlightRealtimeService {
  private channel: RealtimeChannel | null = null;
  private callbacks: RealtimeCallbacks;
  private status: ConnectionStatus = "disconnected";
  private eventBatch: RealtimeEvent[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(callbacks: RealtimeCallbacks) {
    this.callbacks = callbacks;
  }

  /** Start the subscription. */
  connect(): void {
    if (this.disposed) return;
    this.setStatus("connecting");
    this.reconnectAttempt = 0;
    this.startBatchFlush();
    this.subscribe();
  }

  /** Tear down everything. */
  disconnect(): void {
    this.disposed = true;
    this.stopBatchFlush();
    this.clearReconnectTimer();

    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.setStatus("disconnected");
  }

  /** Current connection status. */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ── Internal ────────────────────────────────────────────────────────

  private subscribe(): void {
    if (this.disposed) return;

    // Clean up previous channel if any
    if (this.channel) {
      supabase.removeChannel(this.channel);
    }

    this.channel = supabase
      .channel("flights_realtime", {
        config: { broadcast: { self: true } },
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flights_current" },
        (payload) => {
          this.handlePayload(payload);
        }
      )
      .subscribe((status) => {
        if (this.disposed) return;

        if (status === "SUBSCRIBED") {
          this.setStatus("connected");
          this.reconnectAttempt = 0;
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          this.setStatus("disconnected");
          this.scheduleReconnect();
        }
      });
  }

  private handlePayload(payload: any): void {
    const event: RealtimeEvent = {
      type: payload.eventType as RealtimeEvent["type"],
      flight: (payload.eventType === "DELETE"
        ? payload.old
        : payload.new) as Flight,
      old: payload.eventType === "UPDATE" ? payload.old : undefined,
      timestamp: Date.now(),
    };

    this.eventBatch.push(event);
  }

  /** Flush batched events to the callback. */
  private flushBatch(): void {
    if (this.eventBatch.length === 0) return;

    const batch = this.eventBatch;
    this.eventBatch = [];

    // Deduplicate: keep only the latest event per flight ID
    const latest = new Map<string, RealtimeEvent>();
    for (const evt of batch) {
      latest.set(evt.flight.id, evt);
    }

    this.callbacks.onEvent(Array.from(latest.values()));
  }

  private startBatchFlush(): void {
    this.stopBatchFlush();
    this.batchTimer = setInterval(() => this.flushBatch(), BATCH_INTERVAL_MS);
  }

  private stopBatchFlush(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    // Final flush
    this.flushBatch();
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;

    this.clearReconnectTimer();
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempt),
      MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempt++;
    this.setStatus("connecting");

    this.reconnectTimer = setTimeout(() => {
      this.subscribe();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange(status);
    }
  }
}
