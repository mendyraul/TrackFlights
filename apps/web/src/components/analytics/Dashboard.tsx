"use client";

import { useAnalytics } from "@/hooks/useAnalytics";
import { useFlights } from "@/hooks/useFlights";
import { KpiCards } from "@/components/analytics/KpiCards";
import { DelayTrendsChart } from "@/components/analytics/DelayTrendsChart";
import { TrafficVolumeChart } from "@/components/analytics/TrafficVolumeChart";
import { StatusBreakdown } from "@/components/analytics/StatusBreakdown";

export function Dashboard() {
  const { hourly, daily, loading: analyticsLoading } = useAnalytics();
  const { flights, loading: flightsLoading } = useFlights();

  const loading = analyticsLoading || flightsLoading;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-mia-accent border-t-transparent" />
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-200">
          Operations Dashboard
        </h2>
        <span className="text-xs text-gray-500">
          Data from {daily.length} days · {hourly.length} hourly snapshots
        </span>
      </div>

      {/* KPI cards from analytics + live data */}
      <KpiCards daily={daily} flights={flights} />

      {/* Live status breakdown */}
      <StatusBreakdown flights={flights} />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DelayTrendsChart hourly={hourly} />
        <TrafficVolumeChart daily={daily} />
      </div>
    </div>
  );
}
