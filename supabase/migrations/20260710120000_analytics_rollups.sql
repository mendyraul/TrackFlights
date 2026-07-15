-- Analytics rollups, archival, and pruning — computed inside Postgres.
-- =====================================================================
-- Aggregation runs DB-side (pg_cron) so no flight data leaves Supabase:
-- zero egress cost regardless of table size. Populates the previously
-- writer-less analytics_hourly / analytics_daily tables and implements the
-- archival flow (flights_current -> flights_history) that the Python
-- ingestor deliberately stubs out.
--
-- Only rows with data_source = 'flightaware' feed the rollups: ADS-B
-- contacts carry no schedule, so counting them would poison on-time math.
-- raw_data is excluded from history rows to keep the 500MB free-tier DB cap
-- comfortable; the existing Python retention pruning (7 days) bounds
-- flights_history size.
--
-- If pg_cron cannot be enabled on the project, the functions still exist and
-- can be invoked via supabase-js/postgrest RPC from the ingestor instead
-- (aggregation stays server-side either way).

-- ---------------------
-- Archival: completed flights -> history
-- ---------------------

CREATE OR REPLACE FUNCTION archive_completed_flights_sql()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_count INTEGER;
BEGIN
  WITH moved AS (
    DELETE FROM flights_current fc
    WHERE fc.data_source = 'flightaware'
      AND fc.status IN ('landed', 'arrived', 'departed', 'cancelled', 'diverted')
      AND fc.updated_at < NOW() - INTERVAL '2 hours'
    RETURNING fc.*
  )
  INSERT INTO flights_history (
    flight_iata, flight_icao, flight_number,
    airline_iata, airline_name,
    aircraft_icao, aircraft_registration,
    direction, origin_iata, origin_name, destination_iata, destination_name,
    scheduled_departure, actual_departure, scheduled_arrival, actual_arrival,
    status, delay_minutes,
    departure_terminal, departure_gate, arrival_terminal, arrival_gate,
    data_source, created_at
  )
  SELECT
    flight_iata, flight_icao, flight_number,
    airline_iata, airline_name,
    aircraft_icao, aircraft_registration,
    direction, origin_iata, origin_name, destination_iata, destination_name,
    scheduled_departure, actual_departure, scheduled_arrival, actual_arrival,
    status, delay_minutes,
    departure_terminal, departure_gate, arrival_terminal, arrival_gate,
    data_source, created_at
  FROM moved;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

-- ---------------------
-- Purge: drop dead rows the archiver can't claim (ADS-B ghosts, unknowns)
-- ---------------------

CREATE OR REPLACE FUNCTION purge_stale_current()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purged_count INTEGER;
BEGIN
  DELETE FROM flights_current
  WHERE updated_at < NOW() - INTERVAL '48 hours';

  GET DIAGNOSTICS purged_count = ROW_COUNT;
  RETURN purged_count;
END;
$$;

-- ---------------------
-- Hourly rollup: trailing 26h window (absorbs late status changes)
-- ---------------------

CREATE OR REPLACE FUNCTION rollup_analytics_hourly()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  upserted_count INTEGER;
BEGIN
  WITH flights AS (
    SELECT direction, status, COALESCE(delay_minutes, 0) AS delay_minutes,
           date_trunc('hour',
             CASE WHEN direction = 'arrival'
                  THEN COALESCE(actual_arrival, estimated_arrival, scheduled_arrival)
                  ELSE COALESCE(actual_departure, scheduled_departure)
             END) AS bucket
    FROM flights_current
    WHERE data_source = 'flightaware'
    UNION ALL
    SELECT direction, status, COALESCE(delay_minutes, 0),
           date_trunc('hour',
             CASE WHEN direction = 'arrival'
                  THEN COALESCE(actual_arrival, scheduled_arrival)
                  ELSE COALESCE(actual_departure, scheduled_departure)
             END)
    FROM flights_history
    WHERE data_source = 'flightaware'
  )
  INSERT INTO analytics_hourly (
    hour, direction, total_flights, on_time, delayed, cancelled, diverted,
    avg_delay_minutes, max_delay_minutes
  )
  SELECT
    bucket, direction,
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'diverted') AND delay_minutes < 15),
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'diverted') AND delay_minutes >= 15),
    COUNT(*) FILTER (WHERE status = 'cancelled'),
    COUNT(*) FILTER (WHERE status = 'diverted'),
    COALESCE(AVG(delay_minutes) FILTER (WHERE status NOT IN ('cancelled', 'diverted')), 0),
    COALESCE(MAX(delay_minutes), 0)
  FROM flights
  WHERE bucket IS NOT NULL
    -- Past hours only: scheduled-board rows for future hours would otherwise
    -- count as on_time before they fly.
    AND bucket >= date_trunc('hour', NOW() - INTERVAL '26 hours')
    AND bucket <= date_trunc('hour', NOW())
  GROUP BY bucket, direction
  ON CONFLICT (hour, direction) DO UPDATE SET
    total_flights = EXCLUDED.total_flights,
    on_time = EXCLUDED.on_time,
    delayed = EXCLUDED.delayed,
    cancelled = EXCLUDED.cancelled,
    diverted = EXCLUDED.diverted,
    avg_delay_minutes = EXCLUDED.avg_delay_minutes,
    max_delay_minutes = EXCLUDED.max_delay_minutes;

  GET DIAGNOSTICS upserted_count = ROW_COUNT;
  RETURN upserted_count;
END;
$$;

-- ---------------------
-- Daily rollup: trailing 2 local days (America/New_York)
-- ---------------------

CREATE OR REPLACE FUNCTION rollup_analytics_daily()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  upserted_count INTEGER;
BEGIN
  WITH flights AS (
    SELECT direction, status, COALESCE(delay_minutes, 0) AS delay_minutes, airline_iata,
           CASE WHEN direction = 'arrival'
                THEN COALESCE(actual_arrival, estimated_arrival, scheduled_arrival)
                ELSE COALESCE(actual_departure, scheduled_departure)
           END AS event_ts
    FROM flights_current
    WHERE data_source = 'flightaware'
    UNION ALL
    SELECT direction, status, COALESCE(delay_minutes, 0), airline_iata,
           CASE WHEN direction = 'arrival'
                THEN COALESCE(actual_arrival, scheduled_arrival)
                ELSE COALESCE(actual_departure, scheduled_departure)
           END
    FROM flights_history
    WHERE data_source = 'flightaware'
  ),
  localized AS (
    SELECT direction, status, delay_minutes, airline_iata,
           (event_ts AT TIME ZONE 'America/New_York')::date AS local_date,
           EXTRACT(HOUR FROM event_ts AT TIME ZONE 'America/New_York')::int AS local_hour
    FROM flights
    WHERE event_ts IS NOT NULL
      -- Past events only: future scheduled-board rows would count as on_time
      -- before they fly and inflate the intraday on-time rate.
      AND event_ts <= NOW()
      AND (event_ts AT TIME ZONE 'America/New_York')::date
            >= (NOW() AT TIME ZONE 'America/New_York')::date - 2
      AND (event_ts AT TIME ZONE 'America/New_York')::date
            <= (NOW() AT TIME ZONE 'America/New_York')::date
  )
  INSERT INTO analytics_daily (
    date, direction, total_flights, on_time, delayed, cancelled, diverted,
    avg_delay_minutes, max_delay_minutes, top_delayed_airline, busiest_hour
  )
  SELECT
    local_date, direction,
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'diverted') AND delay_minutes < 15),
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'diverted') AND delay_minutes >= 15),
    COUNT(*) FILTER (WHERE status = 'cancelled'),
    COUNT(*) FILTER (WHERE status = 'diverted'),
    COALESCE(AVG(delay_minutes) FILTER (WHERE status NOT IN ('cancelled', 'diverted')), 0),
    COALESCE(MAX(delay_minutes), 0),
    (SELECT l2.airline_iata FROM localized l2
      WHERE l2.local_date = l.local_date AND l2.direction = l.direction
        AND l2.delay_minutes >= 15 AND l2.airline_iata IS NOT NULL
      GROUP BY l2.airline_iata ORDER BY COUNT(*) DESC, l2.airline_iata LIMIT 1),
    (SELECT l3.local_hour FROM localized l3
      WHERE l3.local_date = l.local_date AND l3.direction = l.direction
      GROUP BY l3.local_hour ORDER BY COUNT(*) DESC, l3.local_hour LIMIT 1)
  FROM localized l
  GROUP BY local_date, direction
  ON CONFLICT (date, direction) DO UPDATE SET
    total_flights = EXCLUDED.total_flights,
    on_time = EXCLUDED.on_time,
    delayed = EXCLUDED.delayed,
    cancelled = EXCLUDED.cancelled,
    diverted = EXCLUDED.diverted,
    avg_delay_minutes = EXCLUDED.avg_delay_minutes,
    max_delay_minutes = EXCLUDED.max_delay_minutes,
    top_delayed_airline = EXCLUDED.top_delayed_airline,
    busiest_hour = EXCLUDED.busiest_hour;

  GET DIAGNOSTICS upserted_count = ROW_COUNT;
  RETURN upserted_count;
END;
$$;

-- Writable only by service_role / cron (functions are SECURITY DEFINER);
-- revoke direct execution from anon just in case.
REVOKE EXECUTE ON FUNCTION archive_completed_flights_sql() FROM anon;
REVOKE EXECUTE ON FUNCTION purge_stale_current() FROM anon;
REVOKE EXECUTE ON FUNCTION rollup_analytics_hourly() FROM anon;
REVOKE EXECUTE ON FUNCTION rollup_analytics_daily() FROM anon;

-- ---------------------
-- pg_cron scheduling (best-effort: functions remain callable via RPC if the
-- extension is unavailable on this project)
-- ---------------------

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable (%). Schedule the rollup functions via ingestor RPC instead.', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- cron.schedule upserts by job name (pg_cron >= 1.4), so re-running the
    -- migration is safe.
    PERFORM cron.schedule('trackflights-archive', '*/30 * * * *',
      'SELECT public.archive_completed_flights_sql();');
    PERFORM cron.schedule('trackflights-purge-stale', '45 * * * *',
      'SELECT public.purge_stale_current();');
    PERFORM cron.schedule('trackflights-rollup-hourly', '5 * * * *',
      'SELECT public.rollup_analytics_hourly();');
    -- 05:15 UTC = 00:15/01:15 America/New_York: finalizes the previous local day.
    PERFORM cron.schedule('trackflights-rollup-daily', '15 5 * * *',
      'SELECT public.rollup_analytics_daily();');
  END IF;
END $$;
