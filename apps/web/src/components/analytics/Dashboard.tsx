"use client";

import { useAnalytics } from "@/hooks/useAnalytics";
import { useFlights } from "@/hooks/useFlights";
import { useWeather } from "@/hooks/useWeather";
import { usePredictions } from "@/hooks/usePredictions";
import { useAnomalies } from "@/hooks/useAnomalies";
import { ConnectionBadge } from "@/components/ui/ConnectionBadge";
import { KpiCards } from "@/components/analytics/KpiCards";
import { StatusBreakdown } from "@/components/analytics/StatusBreakdown";
import { WeatherCard } from "@/components/analytics/WeatherCard";
import { AnomalyAlerts } from "@/components/analytics/AnomalyAlerts";
import { HighRiskFlights } from "@/components/analytics/HighRiskFlights";
import { DelayPredictionChart } from "@/components/analytics/DelayPredictionChart";
import { DelayTrendsChart } from "@/components/analytics/DelayTrendsChart";
import { TrafficVolumeChart } from "@/components/analytics/TrafficVolumeChart";

export function Dashboard() {
  const { hourly, daily, loading: analyticsLoading } = useAnalytics();
  const { flights, loading: flightsLoading, connectionStatus, lastUpdate } =
    useFlights();
  const { current: weather, loading: weatherLoading } = useWeather();
  const { predictions, highRiskFlights, loading: predictionsLoading } =
    usePredictions();
  const { activeAnomalies, highSeverity, loading: anomaliesLoading } =
    useAnomalies();

  const loading =
    analyticsLoading || flightsLoading || weatherLoading || predictionsLoading || anomaliesLoading;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-mia-accent border-t-transparent" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-200">
          Operations Dashboard
        </h2>
        <ConnectionBadge status={connectionStatus} lastUpdate={lastUpdate} />
      </div>

      {/* Anomaly alerts (top priority) */}
      {activeAnomalies.length > 0 && (
        <AnomalyAlerts anomalies={activeAnomalies} />
      )}

      {/* Weather + KPIs */}
      <WeatherCard weather={weather} />
      <KpiCards daily={daily} flights={flights} />

      {/* Status breakdown */}
      <StatusBreakdown flights={flights} />

      {/* ML Insights section */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          ML Insights
        </h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <HighRiskFlights predictions={predictions} />
          <DelayPredictionChart predictions={predictions} />
        </div>
      </div>

      {/* Historical charts */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Historical Trends
        </h3>
        <div className="grid gap-6 lg:grid-cols-2">
          <DelayTrendsChart hourly={hourly} />
          <TrafficVolumeChart daily={daily} />
        </div>
      </div>
    </div>
  );
}
