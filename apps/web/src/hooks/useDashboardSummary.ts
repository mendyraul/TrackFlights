"use client";

import { useEffect, useState } from "react";
import { fetchDashboardSummary, type DashboardSummary } from "@/lib/dashboard-summary";

const POLL_MS = 5 * 60 * 1000;

/** The whole cached /api/dashboard/summary payload, refreshed every 5 minutes. */
export function useDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchDashboardSummary();
        if (cancelled) return;
        setSummary(data);
        setFailed(false);
      } catch {
        // Keep last known data; the next poll retries.
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { summary, loading, failed };
}
