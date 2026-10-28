-- Traffic history and receiver heartbeat for the ADS-B feed.
--
-- analytics_hourly/daily roll up *schedule* data (on-time, delays), which the
-- ADS-B feed never produces, so they stay empty on an ADS-B-only deployment.
-- traffic_hourly records what a receiver actually observes. The ingestor
-- upserts the current hour every poll via record_traffic_hour(); writes are
-- ingress, and the table is ~24 tiny rows a day.
--
-- ingestor_heartbeat is one row per ingestor, rewritten every poll. It lets
-- the site tell "ingestor down" (heartbeat stale) apart from "ingestor up,
-- radio hearing nothing" (heartbeat fresh, aircraft_received = 0).

CREATE TABLE IF NOT EXISTS traffic_hourly (
  hour TIMESTAMPTZ PRIMARY KEY,
  unique_aircraft INTEGER NOT NULL DEFAULT 0,
  arriving INTEGER NOT NULL DEFAULT 0,
  departing INTEGER NOT NULL DEFAULT 0,
  overflights INTEGER NOT NULL DEFAULT 0,
  on_ground INTEGER NOT NULL DEFAULT 0,
  peak_concurrent INTEGER NOT NULL DEFAULT 0,
  max_range_km REAL,
  polls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestor_heartbeat (
  source TEXT PRIMARY KEY,
  last_poll_at TIMESTAMPTZ NOT NULL,
  aircraft_received INTEGER NOT NULL DEFAULT 0,
  aircraft_in_range INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE traffic_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestor_heartbeat ENABLE ROW LEVEL SECURITY;

-- Read-only for the public API; only service_role (the ingestor) writes.
DROP POLICY IF EXISTS "Public read traffic_hourly" ON traffic_hourly;
CREATE POLICY "Public read traffic_hourly" ON traffic_hourly FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public read ingestor_heartbeat" ON ingestor_heartbeat;
CREATE POLICY "Public read ingestor_heartbeat" ON ingestor_heartbeat FOR SELECT USING (true);

-- Merge one poll's view of the hour. GREATEST, not replace: if the ingestor
-- restarts mid-hour its in-memory counts start from zero, and they must not
-- overwrite the larger totals already recorded for that hour.
CREATE OR REPLACE FUNCTION record_traffic_hour(
  p_hour TIMESTAMPTZ,
  p_unique_aircraft INTEGER,
  p_arriving INTEGER,
  p_departing INTEGER,
  p_overflights INTEGER,
  p_on_ground INTEGER,
  p_peak_concurrent INTEGER,
  p_max_range_km REAL,
  p_polls INTEGER
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO traffic_hourly AS t (
    hour, unique_aircraft, arriving, departing, overflights, on_ground,
    peak_concurrent, max_range_km, polls, updated_at
  ) VALUES (
    date_trunc('hour', p_hour), p_unique_aircraft, p_arriving, p_departing,
    p_overflights, p_on_ground, p_peak_concurrent, p_max_range_km, p_polls, NOW()
  )
  ON CONFLICT (hour) DO UPDATE SET
    unique_aircraft = GREATEST(t.unique_aircraft, EXCLUDED.unique_aircraft),
    arriving = GREATEST(t.arriving, EXCLUDED.arriving),
    departing = GREATEST(t.departing, EXCLUDED.departing),
    overflights = GREATEST(t.overflights, EXCLUDED.overflights),
    on_ground = GREATEST(t.on_ground, EXCLUDED.on_ground),
    peak_concurrent = GREATEST(t.peak_concurrent, EXCLUDED.peak_concurrent),
    max_range_km = GREATEST(t.max_range_km, EXCLUDED.max_range_km),
    polls = GREATEST(t.polls, EXCLUDED.polls),
    updated_at = NOW();
$$;

-- Keep 90 days of hourly history (~2,160 rows).
CREATE OR REPLACE FUNCTION prune_traffic_hourly() RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM traffic_hourly WHERE hour < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- Lock down every write-capable function. Postgres grants EXECUTE on new
-- functions to PUBLIC, and anon inherits from PUBLIC, so the earlier
-- "REVOKE ... FROM anon" (20260710120000) did not stop the public anon key
-- from calling these through /rest/v1/rpc. Revoke from PUBLIC too and grant
-- only to service_role (the ingestor) — pg_cron runs as the owner.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'record_traffic_hour(timestamptz, integer, integer, integer, integer, integer, integer, real, integer)',
    'prune_traffic_hourly()',
    'archive_completed_flights_sql()',
    'purge_stale_current()',
    'rollup_analytics_hourly()',
    'rollup_analytics_daily()'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('trackflights-prune-traffic-hourly', '30 5 * * *',
      'SELECT public.prune_traffic_hourly();');
  END IF;
END $$;
