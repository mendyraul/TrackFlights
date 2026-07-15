// Shared client for /api/dashboard/summary. Four dashboard hooks consume the
// same payload, so requests are deduplicated module-wide: one fetch serves
// every hook mounted within the freshness window.
import type {
  AnalyticsDaily,
  AnalyticsHourly,
  DelayPrediction,
  TrafficAnomaly,
  WeatherSnapshot,
} from "@/types/database";

export interface DashboardSummary {
  analyticsHourly: AnalyticsHourly[];
  analyticsDaily: AnalyticsDaily[];
  weatherCurrent: WeatherSnapshot | null;
  weatherForecast: WeatherSnapshot[];
  predictions: DelayPrediction[];
  anomalies: TrafficAnomaly[];
  lastUpdate: number;
}

// Client-side freshness window. The CDN already caches the route response;
// this only prevents simultaneous hooks from firing duplicate requests.
const CLIENT_TTL_MS = 60_000;

let cached: { at: number; data: DashboardSummary } | null = null;
let inflight: Promise<DashboardSummary> | null = null;

export async function fetchDashboardSummary(force = false): Promise<DashboardSummary> {
  if (!force && cached && Date.now() - cached.at < CLIENT_TTL_MS) {
    return cached.data;
  }
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const resp = await fetch("/api/dashboard/summary");
      if (!resp.ok) {
        throw new Error(`dashboard summary fetch failed: ${resp.status}`);
      }
      const data = (await resp.json()) as DashboardSummary;
      cached = { at: Date.now(), data };
      return data;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function resetDashboardSummaryCache(): void {
  cached = null;
  inflight = null;
}
