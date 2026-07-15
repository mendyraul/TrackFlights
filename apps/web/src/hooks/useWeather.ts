"use client";

import { useEffect, useState } from "react";
import { fetchDashboardSummary } from "@/lib/dashboard-summary";
import type { WeatherSnapshot } from "@/types/database";

const POLL_MS = 5 * 60 * 1000;

interface UseWeatherReturn {
  current: WeatherSnapshot | null;
  forecast: WeatherSnapshot[];
  loading: boolean;
}

export function useWeather(): UseWeatherReturn {
  const [current, setCurrent] = useState<WeatherSnapshot | null>(null);
  const [forecast, setForecast] = useState<WeatherSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const summary = await fetchDashboardSummary();
        if (cancelled) return;
        setCurrent(summary.weatherCurrent);
        setForecast(summary.weatherForecast);
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

  return { current, forecast, loading };
}
