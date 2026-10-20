-- record_traffic_hour(): counts merge with GREATEST, weather with latest-non-null,
-- and only service_role may call it.
BEGIN;

SELECT record_traffic_hour('2026-10-20 14:05Z', 40, 10, 12, 18, 0, 22, 210.5, 100,
                           30.0, 12.0, 18.0, 0.0, 20.0, false);
-- Restart mid-hour: smaller counts, new weather reading, one gap (visibility).
SELECT record_traffic_hour('2026-10-20 14:40Z', 5, 1, 2, 2, 0, 4, 80, 3,
                           31.5, 14.0, NULL, 2.5, NULL, true);

DO $$
DECLARE r traffic_hourly;
BEGIN
  SELECT * INTO r FROM traffic_hourly WHERE hour = '2026-10-20 14:00Z';
  IF r.unique_aircraft <> 40 OR r.peak_concurrent <> 22 OR r.max_range_km <> 210.5 THEN
    RAISE EXCEPTION 'counts shrank after restart: %', row_to_json(r);
  END IF;
  IF r.temp_c <> 31.5 OR r.precip_mm <> 2.5 OR r.is_thunderstorm IS NOT TRUE THEN
    RAISE EXCEPTION 'latest weather not kept: %', row_to_json(r);
  END IF;
  IF r.visibility_km <> 20.0 OR r.gust_kt <> 18.0 THEN
    RAISE EXCEPTION 'a NULL reading overwrote earlier weather: %', row_to_json(r);
  END IF;
  IF has_function_privilege('anon', 'record_traffic_hour(timestamptz,integer,integer,integer,integer,integer,integer,real,integer,real,real,real,real,real,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can call record_traffic_hour';
  END IF;
  IF NOT has_function_privilege('service_role', 'record_traffic_hour(timestamptz,integer,integer,integer,integer,integer,integer,real,integer,real,real,real,real,real,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot call record_traffic_hour';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'record_traffic_hour') <> 1 THEN
    RAISE EXCEPTION 'old record_traffic_hour signature still exists';
  END IF;
END $$;

ROLLBACK;
