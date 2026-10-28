/**
 * Flight phase relative to MIA, inferred from ADS-B state.
 *
 * ADS-B has no arrival/departure board, so phase is a heuristic over what the
 * transponder does report: altitude, vertical rate, track, and position.
 * Using distance and track (not just vertical rate) keeps the common
 * misclassifications in check:
 *   - an airliner descending into Fort Lauderdale 40 km north is still
 *     "arriving" (we can't tell MIA from FLL without a flight plan), but
 *   - a jet cruising at FL350 over Miami is an overflight, not a departure,
 *   - a climbing aircraft pointed *toward* MIA (a departure from another
 *     field crossing the area) isn't called a MIA departure,
 *   - a descent near the airport counts as an arrival whatever the track,
 *     because downwind legs fly *away* from the runway before turning in,
 *   - level aircraft in a holding pattern aren't arrivals or departures.
 */

export const KMIA: readonly [number, number] = [25.79325, -80.29056];

export type FlightPhase =
  | "arriving"
  | "departing"
  | "overflight"
  // Only the learned classifier (ingestor) can tell FLL/OPF/... traffic apart.
  | "other-airport"
  | "on-ground"
  | "unknown";

export const PHASE_LABEL: Record<FlightPhase, string> = {
  arriving: "Arriving",
  departing: "Departing",
  overflight: "Overflight",
  "other-airport": "Nearby airport",
  "on-ground": "On ground",
  unknown: "Unknown",
};

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/** Initial bearing from point 1 to point 2, degrees 0-360. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest angle between two headings, 0-180. */
function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export interface PhaseInput {
  latitude: number | null;
  longitude: number | null;
  altitude_ft: number | null;
  vertical_speed_fpm: number | null;
  heading: number | null;
  ground_speed_knots?: number | null;
  status?: string | null;
}

/** Vertical rate beyond which an aircraft counts as climbing/descending. */
const VRATE_FPM = 300;

/** The ingestor's model phase, when it sent a valid one. */
export function modelPhase(value: string | null | undefined): FlightPhase | null {
  return value && value in PHASE_LABEL && value !== "unknown" ? (value as FlightPhase) : null;
}

export function inferPhase(f: PhaseInput): FlightPhase {
  if (f.latitude == null || f.longitude == null) return "unknown";
  if (f.status === "landed" || f.altitude_ft === 0) return "on-ground";
  if (f.altitude_ft == null) return "unknown";

  const dist = distanceKm(f.latitude, f.longitude, KMIA[0], KMIA[1]);
  const vr = f.vertical_speed_fpm ?? 0;
  const descending = vr <= -VRATE_FPM;
  const climbing = vr >= VRATE_FPM;

  // Angle between where the aircraft is going and the direction to MIA:
  // ~0 means heading at the airport, ~180 means heading away from it.
  const toMia = bearingDeg(f.latitude, f.longitude, KMIA[0], KMIA[1]);
  const offset = f.heading == null ? null : angleBetween(f.heading, toMia);
  const towards = offset !== null && offset <= 75;
  const away = offset !== null && offset >= 105;

  // Terminal area: below 12,000 ft within ~60 km of MIA.
  if (dist <= 60 && f.altitude_ft < 12_000) {
    if (descending) return "arriving";
    if (climbing && !towards) return "departing";
    // Low, level and lined up on the airport: final approach.
    if (f.altitude_ft < 3_000 && dist <= 20 && towards) return "arriving";
    return "overflight";
  }

  // Wider area: only call it if the geometry agrees with the vertical trend.
  if (dist <= 200 && f.altitude_ft < 25_000) {
    if (descending && towards) return "arriving";
    if (climbing && away) return "departing";
  }

  return "overflight";
}
