import { supabase } from "@/lib/supabase";
import {
  ANALYTICS_DAILY_COLUMNS,
  ANALYTICS_HOURLY_COLUMNS,
  ANOMALY_COLUMNS,
  PREDICTION_COLUMNS,
  TRAFFIC_HOURLY_COLUMNS,
  WEATHER_COLUMNS,
} from "@/lib/dashboard-selects";

// One CDN-cached response bundles every non-flight dashboard read (weather,
// analytics, predictions, anomalies). Browsers hit this route instead of
// Supabase directly, so dashboard egress is bounded by the refresh window
// rather than the audience size — same pattern as /api/flights/snapshot.
const parsedRefreshSeconds = Number(process.env.DASHBOARD_SUMMARY_REFRESH_SECONDS);
const REFRESH_SECONDS =
  Number.isFinite(parsedRefreshSeconds) && parsedRefreshSeconds > 0 ? parsedRefreshSeconds : 300;

export const dynamic = "force-dynamic";

export async function GET() {
  const nowIso = new Date().toISOString();
  const anomalyCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const trafficCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [hourly, daily, weatherCurrent, weatherForecast, predictions, anomalies, traffic] =
    await Promise.all([
      supabase
        .from("analytics_hourly")
        .select(ANALYTICS_HOURLY_COLUMNS)
        .order("hour", { ascending: false })
        .limit(48),
      supabase
        .from("analytics_daily")
        .select(ANALYTICS_DAILY_COLUMNS)
        .order("date", { ascending: false })
        .limit(30),
      supabase
        .from("weather_snapshots")
        .select(WEATHER_COLUMNS)
        .eq("airport_iata", "MIA")
        .lte("observed_at", nowIso)
        .order("observed_at", { ascending: false })
        .limit(1),
      supabase
        .from("weather_snapshots")
        .select(WEATHER_COLUMNS)
        .eq("airport_iata", "MIA")
        .gte("observed_at", nowIso)
        .order("observed_at", { ascending: true })
        .limit(12),
      supabase
        .from("delay_predictions")
        .select(PREDICTION_COLUMNS)
        .gte("expires_at", nowIso)
        .order("predicted_value", { ascending: false })
        .limit(500),
      supabase
        .from("traffic_anomalies")
        .select(ANOMALY_COLUMNS)
        .gte("detected_at", anomalyCutoff)
        .order("detected_at", { ascending: false })
        .limit(200),
      // ADS-B traffic history (migration 20261020120000). Optional: a missing
      // table must not take down the rest of the dashboard.
      supabase
        .from("traffic_hourly")
        .select(TRAFFIC_HOURLY_COLUMNS)
        .gte("hour", trafficCutoff)
        .order("hour", { ascending: true })
        .limit(48),
    ]);

  const required = [hourly, daily, weatherCurrent, weatherForecast, predictions, anomalies];
  const firstError = required.find((res) => res.error)?.error;

  if (firstError) {
    return Response.json(
      { error: firstError.message },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    {
      analyticsHourly: hourly.data ?? [],
      analyticsDaily: daily.data ?? [],
      weatherCurrent: weatherCurrent.data?.[0] ?? null,
      weatherForecast: weatherForecast.data ?? [],
      predictions: predictions.data ?? [],
      anomalies: anomalies.data ?? [],
      trafficHourly: traffic.error ? [] : (traffic.data ?? []),
      lastUpdate: Date.now(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=${REFRESH_SECONDS}, stale-while-revalidate=${REFRESH_SECONDS * 2}`,
      },
    }
  );
}
