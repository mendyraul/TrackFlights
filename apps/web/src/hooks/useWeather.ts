"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { WEATHER_COLUMNS } from "@/lib/dashboard-selects";
import type { WeatherSnapshot } from "@/types/database";

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
    async function fetch() {
      const { data: latest } = await supabase
        .from("weather_snapshots")
        .select(WEATHER_COLUMNS)
        .eq("airport_iata", "MIA")
        .order("observed_at", { ascending: false })
        .limit(1);

      if (latest && latest.length > 0) setCurrent(latest[0] as WeatherSnapshot);

      const now = new Date().toISOString();
      const { data: forecastData } = await supabase
        .from("weather_snapshots")
        .select(WEATHER_COLUMNS)
        .eq("airport_iata", "MIA")
        .gte("observed_at", now)
        .order("observed_at", { ascending: true })
        .limit(12);

      if (forecastData) setForecast(forecastData as WeatherSnapshot[]);
      setLoading(false);
    }

    fetch();
    const interval = setInterval(fetch, 2 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { current, forecast, loading };
}
