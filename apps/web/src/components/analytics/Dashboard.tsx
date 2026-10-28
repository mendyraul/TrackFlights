"use client";

import { useMemo } from "react";
import { useFlights } from "@/hooks/useFlights";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { DataStatusBanner } from "@/components/ui/DataStatusBanner";
import { LiveTraffic } from "@/components/analytics/LiveTraffic";
import { TrafficHistoryChart } from "@/components/analytics/TrafficHistoryChart";
import { WeatherCard } from "@/components/analytics/WeatherCard";
import { AnomalyAlerts } from "@/components/analytics/AnomalyAlerts";
import { DelayTrendsChart } from "@/components/analytics/DelayTrendsChart";
import { TrafficVolumeChart } from "@/components/analytics/TrafficVolumeChart";
import { toAircraft, visibleFlights } from "@/lib/aircraft";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-300">
      {children}
    </h2>
  );
}

function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg border border-gray-800 bg-mia-panel ${className}`}
    />
  );
}

export function Dashboard() {
  const { flights, loading: flightsLoading, freshness, dataUpdatedAt, now } = useFlights();
  const { summary, loading: summaryLoading, failed } = useDashboardSummary();

  // Same cached snapshot as the map: no extra database reads for this section.
  const aircraft = useMemo(
    () => visibleFlights(flights, freshness, now).map(toAircraft),
    // `now` ticks every second; recompute only when a snapshot arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flights, freshness]
  );
  const stale = freshness === "offline" || freshness === "error";

  const activeAnomalies = (summary?.anomalies ?? []).filter((a) => a.is_active);
  const hasScheduleHistory =
    (summary?.analyticsHourly.length ?? 0) > 0 || (summary?.analyticsDaily.length ?? 0) > 0;

  return (
    <div className="space-y-8 px-4 py-5 sm:px-6">
      <DataStatusBanner
        freshness={freshness}
        dataUpdatedAt={dataUpdatedAt}
        now={now}
        showing="the last aircraft seen"
        variant="toast"
      />

      {activeAnomalies.length > 0 && <AnomalyAlerts anomalies={activeAnomalies} />}

      <div>
        <SectionHeading>{stale ? "Last known picture" : "Right now"}</SectionHeading>
        {flightsLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        ) : (
          <LiveTraffic aircraft={aircraft} stale={stale} />
        )}
      </div>

      <div>
        <SectionHeading>History</SectionHeading>
        {summaryLoading ? (
          <Skeleton className="h-72" />
        ) : failed && !summary ? (
          <p className="rounded-lg border border-gray-800 bg-mia-panel p-5 text-sm text-gray-300">
            History is unavailable right now. The live sections above still work; this retries every
            few minutes.
          </p>
        ) : (
          <TrafficHistoryChart
            hours={summary?.trafficHourly ?? []}
            forecast={summary?.trafficForecast ?? []}
          />
        )}
      </div>

      <div>
        <SectionHeading>Conditions</SectionHeading>
        {summaryLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <WeatherCard weather={summary?.weatherCurrent ?? null} now={now} />
        )}
      </div>

      {/* Schedule-feed analytics (optional AeroAPI ingestor). ADS-B alone carries
          no schedules, delays or cancellations, so this only renders with data. */}

      {hasScheduleHistory && summary && (
        <div>
          <SectionHeading>Schedule history (AeroAPI)</SectionHeading>
          <div className="grid gap-6 lg:grid-cols-2">
            <DelayTrendsChart hourly={summary.analyticsHourly} />
            <TrafficVolumeChart daily={summary.analyticsDaily} />
          </div>
        </div>
      )}
    </div>
  );
}
