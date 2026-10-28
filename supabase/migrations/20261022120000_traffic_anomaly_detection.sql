-- "Unusually busy / unusually quiet" alerts from traffic_hourly.
--
-- Each hour, compare the hour that just finished with the same hour of the
-- week over the previous 8 weeks (Tuesday 5 pm vs the last 8 Tuesdays at
-- 5 pm), using a robust z-score: (x - median) / (1.4826 * MAD). Median and
-- MAD aren't dragged around by the odd storm or outage the way mean and
-- standard deviation are. |z| >= 3 raises an alert in traffic_anomalies.
--
-- Guards against false alarms:
--   * at least 3 comparable weeks, or no verdict;
--   * the hour and its baseline hours need near-full coverage (polls), so a
--     receiver that was down for half an hour isn't reported as "quiet";
--   * a MAD floor of 1 aircraft, so a very steady hour can't make a
--     one-aircraft difference look extreme.
-- Runs entirely in Postgres (pg_cron), so no data leaves Supabase.

ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'traffic_high';
ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'traffic_low';

CREATE OR REPLACE FUNCTION detect_traffic_anomalies(
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_min_polls INTEGER DEFAULT 200,   -- of ~240 at a 15 s poll
  p_threshold DOUBLE PRECISION DEFAULT 3.0
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_hour TIMESTAMPTZ := date_trunc('hour', p_now) - INTERVAL '1 hour';
  x INTEGER;
  x_polls INTEGER;
  samples INTEGER;
  med DOUBLE PRECISION;
  mad DOUBLE PRECISION;
  z DOUBLE PRECISION;
  local_label TEXT;
BEGIN
  -- Alerts describe one hour; retire them three hours later.
  UPDATE traffic_anomalies
     SET is_active = FALSE, resolved_at = NOW()
   WHERE is_active
     AND detection_model = 'robust-z-v1'
     AND (raw_evidence->>'hour')::timestamptz < p_now - INTERVAL '3 hours';

  SELECT unique_aircraft, polls INTO x, x_polls FROM traffic_hourly WHERE hour = target_hour;
  IF x IS NULL OR x_polls < p_min_polls THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM traffic_anomalies
     WHERE detection_model = 'robust-z-v1'
       AND (raw_evidence->>'hour')::timestamptz = target_hour
  ) THEN
    RETURN 0;  -- already judged (cron retry or manual run)
  END IF;

  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY t.unique_aircraft)
    INTO samples, med
    FROM traffic_hourly t
    JOIN generate_series(1, 8) AS k ON t.hour = target_hour - make_interval(days => 7 * k)
   WHERE t.polls >= p_min_polls;

  IF samples < 3 THEN
    RETURN 0;
  END IF;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(t.unique_aircraft - med))
    INTO mad
    FROM traffic_hourly t
    JOIN generate_series(1, 8) AS k ON t.hour = target_hour - make_interval(days => 7 * k)
   WHERE t.polls >= p_min_polls;

  z := (x - med) / (1.4826 * GREATEST(mad, 1.0));
  IF abs(z) < p_threshold THEN
    RETURN 0;
  END IF;

  local_label := to_char(target_hour AT TIME ZONE 'America/New_York', 'Dy FMHH12 am');

  INSERT INTO traffic_anomalies (
    anomaly_type, severity, title, description,
    affected_count, metric_name, metric_value, baseline_value, deviation_pct,
    detected_at, is_active, detection_model, raw_evidence
  ) VALUES (
    (CASE WHEN z > 0 THEN 'traffic_high' ELSE 'traffic_low' END)::anomaly_type,
    (CASE
       WHEN abs(z) >= 6 THEN 'critical'
       WHEN abs(z) >= 5 THEN 'high'
       WHEN abs(z) >= 4 THEN 'medium'
       ELSE 'low'
     END)::anomaly_severity,
    format('Unusually %s: %s aircraft vs ~%s typical for %s',
           CASE WHEN z > 0 THEN 'busy' ELSE 'quiet' END, x, round(med)::int, local_label),
    format('The same hour over the previous %s weeks had a median of %s aircraft '
           '(robust z = %s).', samples, round(med)::int, round(z::numeric, 1)),
    0,
    'unique_aircraft_per_hour',
    x,
    med,
    CASE WHEN med > 0 THEN (x - med) / med * 100 END,
    p_now,
    TRUE,
    'robust-z-v1',
    jsonb_build_object('hour', target_hour, 'z', z, 'median', med, 'mad', mad, 'samples', samples)
  );
  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION detect_traffic_anomalies(timestamptz, integer, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION detect_traffic_anomalies(timestamptz, integer, double precision)
  TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('trackflights-traffic-anomalies', '10 * * * *',
      'SELECT public.detect_traffic_anomalies();');
  END IF;
END $$;
