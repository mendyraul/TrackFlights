"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AnalyticsDaily, AnalyticsHourly } from "@/types/database";

const HOURLY_COLUMNS = "hour,direction,total_flights,avg_delay_minutes,on_time_count,delayed_count,cancelled_count";
const DAILY_COLUMNS = "date,total_flights,avg_delay_minutes,on_time_count,delayed_count,cancelled_count";

export function useAnalytics() {
  const [hourly, setHourly] = useState<AnalyticsHourly[]>([]);
  const [daily, setDaily] = useState<AnalyticsDaily[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const [hourlyRes, dailyRes] = await Promise.all([
        supabase
          .from("analytics_hourly")
          .select(HOURLY_COLUMNS)
          .order("hour", { ascending: false })
          .limit(48),
        supabase
          .from("analytics_daily")
          .select(DAILY_COLUMNS)
          .order("date", { ascending: false })
          .limit(30),
      ]);

      if (hourlyRes.data) setHourly(hourlyRes.data as AnalyticsHourly[]);
      if (dailyRes.data) setDaily(dailyRes.data as AnalyticsDaily[]);
      setLoading(false);
    }

    fetch();
  }, []);

  return { hourly, daily, loading };
}
