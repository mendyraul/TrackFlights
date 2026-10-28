-- Hourly traffic forecast written by the ingestor from an exported model
-- (apps/ml). One row per future hour, overwritten as the forecast updates;
-- each row carries the model's held-out error so the site can show it.

CREATE TABLE IF NOT EXISTS traffic_forecast (
  hour TIMESTAMPTZ PRIMARY KEY,
  predicted_aircraft REAL NOT NULL,
  model_version TEXT NOT NULL,
  model_mae REAL,
  baseline_mae REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE traffic_forecast ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read traffic_forecast" ON traffic_forecast;
CREATE POLICY "Public read traffic_forecast" ON traffic_forecast FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION prune_traffic_forecast() RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM traffic_forecast WHERE hour < NOW() - INTERVAL '2 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION prune_traffic_forecast() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_traffic_forecast() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('trackflights-prune-traffic-forecast', '40 5 * * *',
      'SELECT public.prune_traffic_forecast();');
  END IF;
END $$;
