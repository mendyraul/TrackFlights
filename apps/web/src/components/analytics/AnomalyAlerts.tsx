"use client";

import type { TrafficAnomaly, AnomalySeverity } from "@/types/database";

interface Props {
  anomalies: TrafficAnomaly[];
}

const SEVERITY_STYLES: Record<AnomalySeverity, { bg: string; border: string; text: string; icon: string }> = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-400", icon: "!!" },
  high: { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", icon: "!" },
  medium: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", icon: "~" },
  low: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", icon: "i" },
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function AnomalyAlerts({ anomalies }: Props) {
  if (anomalies.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Active Alerts
        </h3>
        <span className="text-xs text-gray-500">{anomalies.length} total</span>
      </div>

      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {anomalies.map((anomaly) => {
          const style = SEVERITY_STYLES[anomaly.severity];
          return (
            <div
              key={anomaly.id}
              className={`rounded-lg border ${style.border} ${style.bg} px-4 py-3`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${style.bg} ${style.text} border ${style.border}`}
                  >
                    {style.icon}
                  </span>
                  <span className={`text-sm font-medium ${style.text}`}>
                    {anomaly.title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${style.bg} ${style.text} border ${style.border}`}
                  >
                    {anomaly.severity}
                  </span>
                  <span className="text-xs text-gray-600">
                    {timeAgo(anomaly.detected_at)}
                  </span>
                </div>
              </div>
              {anomaly.description && (
                <p className="mt-1.5 text-xs text-gray-400">
                  {anomaly.description}
                </p>
              )}
              {anomaly.affected_count > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {anomaly.affected_count} flights affected
                  {anomaly.affected_airlines.length > 0 &&
                    ` · Airlines: ${anomaly.affected_airlines.join(", ")}`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
