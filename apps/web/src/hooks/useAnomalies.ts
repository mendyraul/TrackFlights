"use client";

import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "@/lib/dashboard-summary";
import type { TrafficAnomaly } from "@/types/database";

const POLL_MS = 5 * 60 * 1000;

interface UseAnomaliesReturn {
  anomalies: TrafficAnomaly[];
  activeAnomalies: TrafficAnomaly[];
  highSeverity: TrafficAnomaly[];
  loading: boolean;
}

// Anomalies previously kept a Supabase realtime channel open per viewer; like
// the flights realtime subscription (removed for egress cost), they now ride
// the shared CDN-cached summary poll.
export function useAnomalies(): UseAnomaliesReturn {
  const [anomalies, setAnomalies] = useState<TrafficAnomaly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const summary = await fetchDashboardSummary();
        if (cancelled) return;
        setAnomalies(summary.anomalies);
      } catch {
        // Keep last known data; the next poll retries.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const activeAnomalies = anomalies.filter((a) => a.is_active);
  const highSeverity = activeAnomalies.filter(
    (a) => a.severity === "high" || a.severity === "critical"
  );

  return { anomalies, activeAnomalies, highSeverity, loading };
}
