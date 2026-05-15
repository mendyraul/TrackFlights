"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { WeatherSnapshot } from "@/types/database";

const WEATHER_COLUMNS = "airport_iata,observed_at,temperature_c,dewpoint_c,humidity_pct,pressure_hpa,wind_speed_knots,wind_gust_knots,wind_direction_deg,visibility_km,cloud_cover_pct,weather_code,weather_description,is_thunderstorm,is_fog,precipitation_mm";

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
