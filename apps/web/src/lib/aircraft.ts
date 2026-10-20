import type { Flight } from "@/types/database";
import { broadcastCallsign, describeCallsign, type CallsignInfo } from "@/lib/airlines";
import { KMIA, distanceKm, inferPhase, type FlightPhase } from "@/lib/phase";
import { trackedNow, type Freshness } from "@/lib/freshness";

/** A snapshot row plus everything the UI derives from ADS-B state. */
export interface Aircraft {
  flight: Flight;
  /** Callsign as broadcast (e.g. "AAL1234"), or null if none was heard. */
  callsign: string | null;
  /** Callsign, or the hex address when there is none. Always something to show. */
  ident: string;
  hex: string | null;
  operator: CallsignInfo;
  phase: FlightPhase;
  distanceKm: number | null;
  updatedAt: number;
}

export function toAircraft(flight: Flight): Aircraft {
  const callsign = broadcastCallsign(flight);
  const hex = flight.icao_hex?.toUpperCase() ?? null;
  return {
    flight,
    callsign,
    ident: callsign ?? hex ?? flight.flight_iata,
    hex,
    operator: describeCallsign(callsign),
    phase: inferPhase(flight),
    distanceKm:
      flight.latitude != null && flight.longitude != null
        ? distanceKm(flight.latitude, flight.longitude, KMIA[0], KMIA[1])
        : null,
    updatedAt: Date.parse(flight.updated_at),
  };
}

/**
 * Rows worth showing. While the receiver is live, only aircraft heard in the
 * last few minutes: the snapshot can also contain rows that simply stopped
 * updating (landed, out of range). While offline, everything we have, so
 * the page can show the last known picture under an "offline" banner.
 */
export function visibleFlights(flights: Flight[], freshness: Freshness, now: number): Flight[] {
  const rows = freshness === "live" || freshness === "delayed" ? trackedNow(flights, now) : flights;
  return dedupeByHex(rows);
}

/**
 * One row per physical aircraft. flights_current is keyed by callsign (or by
 * hex when no callsign was heard), so an aircraft first heard without a
 * callsign and later with one can own two rows. The ICAO hex address is the
 * aircraft's real identity: keep its newest row, preferring one with a
 * callsign on ties.
 */
export function dedupeByHex(flights: Flight[]): Flight[] {
  const best = new Map<string, Flight>();
  const out: Flight[] = [];
  for (const f of flights) {
    const hex = f.icao_hex?.toUpperCase();
    if (!hex) {
      out.push(f);
      continue;
    }
    const current = best.get(hex);
    if (!current || isBetter(f, current)) best.set(hex, f);
  }
  return [...out, ...best.values()];
}

function isBetter(candidate: Flight, current: Flight): boolean {
  const a = Date.parse(candidate.updated_at);
  const b = Date.parse(current.updated_at);
  if (a !== b) return a > b;
  return Boolean(candidate.flight_icao) && !current.flight_icao;
}
