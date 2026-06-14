"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TrafficAnomaly } from "@/types/database";

const ANOMALY_COLUMNS =
  "id,anomaly_type,severity,title,description,metric_name,metric_value,baseline_value,deviation_pct,affected_flights,affected_airlines,affected_count,is_active,detected_at,resolved_at,detection_model";

interface UseAnomaliesReturn {
  anomalies: TrafficAnomaly[];
  activeAnomalies: TrafficAnomaly[];
  highSeverity: TrafficAnomaly[];
  loading: boolean;
}

export function useAnomalies(): UseAnomaliesReturn {
  const [anomalies, setAnomalies] = useState<TrafficAnomaly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from("traffic_anomalies")
        .select(ANOMALY_COLUMNS)
        .gte("detected_at", cutoff)
        .order("detected_at", { ascending: false })
        .limit(200);

      if (data) setAnomalies(data as TrafficAnomaly[]);
      setLoading(false);
    }

    fetch();

    const channel = supabase
      .channel("anomalies_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "traffic_anomalies" },
        (payload) => {
          const newAnomaly = payload.new as TrafficAnomaly;
          setAnomalies((prev) => [newAnomaly, ...prev].slice(0, 200));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const activeAnomalies = anomalies.filter((a) => a.is_active);
  const highSeverity = activeAnomalies.filter(
    (a) => a.severity === "high" || a.severity === "critical"
  );

  return { anomalies, activeAnomalies, highSeverity, loading };
}
