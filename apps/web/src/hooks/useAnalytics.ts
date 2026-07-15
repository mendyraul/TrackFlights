"use client";

import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "@/lib/dashboard-summary";
import type { AnalyticsDaily, AnalyticsHourly } from "@/types/database";

const POLL_MS = 5 * 60 * 1000;

export function useAnalytics() {
  const [hourly, setHourly] = useState<AnalyticsHourly[]>([]);
  const [daily, setDaily] = useState<AnalyticsDaily[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const summary = await fetchDashboardSummary();
        if (cancelled) return;
        setHourly(summary.analyticsHourly);
        setDaily(summary.analyticsDaily);
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

  return { hourly, daily, loading };
}
