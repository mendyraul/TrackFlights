"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ANALYTICS_DAILY_COLUMNS, ANALYTICS_HOURLY_COLUMNS } from "@/lib/dashboard-selects";
import type { AnalyticsDaily, AnalyticsHourly } from "@/types/database";

export function useAnalytics() {
  const [hourly, setHourly] = useState<AnalyticsHourly[]>([]);
  const [daily, setDaily] = useState<AnalyticsDaily[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const [hourlyRes, dailyRes] = await Promise.all([
        supabase
          .from("analytics_hourly")
          .select(ANALYTICS_HOURLY_COLUMNS)
          .order("hour", { ascending: false })
          .limit(48),
        supabase
          .from("analytics_daily")
          .select(ANALYTICS_DAILY_COLUMNS)
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
