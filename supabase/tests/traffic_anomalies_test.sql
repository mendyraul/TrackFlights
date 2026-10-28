-- detect_traffic_anomalies(): finds a seeded spike and dip, stays silent on a
-- normal hour and on an hour with poor receiver coverage, never double-reports,
-- and can't be called by anon.
BEGIN;

-- 9 weeks of hourly traffic with a daily shape and small deterministic noise.
INSERT INTO traffic_hourly (hour, unique_aircraft, polls)
SELECT h,
       20 + 2 * extract(hour FROM h)::int + (extract(epoch FROM h)::bigint / 3600 % 3)::int,
       240
  FROM generate_series('2026-08-17 00:00Z'::timestamptz, '2026-10-19 23:00Z', '1 hour') AS h;

-- Targets in the last week.
UPDATE traffic_hourly SET unique_aircraft = unique_aircraft + 60 WHERE hour = '2026-10-19 21:00Z'; -- spike
UPDATE traffic_hourly SET unique_aircraft = 2                     WHERE hour = '2026-10-19 18:00Z'; -- dip
UPDATE traffic_hourly SET unique_aircraft = 3, polls = 90         WHERE hour = '2026-10-19 15:00Z'; -- receiver gap

DO $$
DECLARE n INTEGER;
BEGIN
  -- Normal hour: nothing.
  IF detect_traffic_anomalies('2026-10-19 13:10Z') <> 0 THEN
    RAISE EXCEPTION 'normal hour was flagged';
  END IF;

  -- Low count but the receiver only covered part of the hour: nothing.
  IF detect_traffic_anomalies('2026-10-19 16:10Z') <> 0 THEN
    RAISE EXCEPTION 'partial-coverage hour was flagged as quiet';
  END IF;

  IF detect_traffic_anomalies('2026-10-19 19:10Z') <> 1 THEN
    RAISE EXCEPTION 'dip not detected';
  END IF;
  IF detect_traffic_anomalies('2026-10-19 22:10Z') <> 1 THEN
    RAISE EXCEPTION 'spike not detected';
  END IF;
  -- Re-running the same hour doesn't duplicate.
  IF detect_traffic_anomalies('2026-10-19 22:40Z') <> 0 THEN
    RAISE EXCEPTION 'spike reported twice';
  END IF;

  SELECT count(*) INTO n FROM traffic_anomalies
   WHERE anomaly_type = 'traffic_high' AND title LIKE 'Unusually busy:%';
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 traffic_high, got %', n; END IF;
  -- 21:00 UTC on Mon 19 Oct 2026 is 5 pm in Miami (EDT).
  IF NOT EXISTS (SELECT 1 FROM traffic_anomalies
                  WHERE anomaly_type = 'traffic_high'
                    AND title ~ '^Unusually busy: [0-9]+ aircraft vs ~[0-9]+ typical for Mon 5 pm$') THEN
    RAISE EXCEPTION 'unexpected title: %', (SELECT title FROM traffic_anomalies WHERE anomaly_type = 'traffic_high');
  END IF;
  SELECT count(*) INTO n FROM traffic_anomalies
   WHERE anomaly_type = 'traffic_low' AND title LIKE 'Unusually quiet:%';
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 traffic_low, got %', n; END IF;

  -- Three hours on, the dip alert retires.
  PERFORM detect_traffic_anomalies('2026-10-19 23:10Z');
  SELECT count(*) INTO n FROM traffic_anomalies WHERE anomaly_type = 'traffic_low' AND is_active;
  IF n <> 0 THEN RAISE EXCEPTION 'old alert not resolved'; END IF;

  -- Too little history: no verdict.
  DELETE FROM traffic_hourly WHERE hour < '2026-10-05 00:00Z';
  UPDATE traffic_hourly SET unique_aircraft = 500 WHERE hour = '2026-10-19 10:00Z';
  IF detect_traffic_anomalies('2026-10-19 11:10Z') <> 0 THEN
    RAISE EXCEPTION 'flagged with fewer than 3 comparable weeks';
  END IF;

  IF has_function_privilege('anon', 'detect_traffic_anomalies(timestamptz,integer,double precision)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can call detect_traffic_anomalies';
  END IF;
END $$;

ROLLBACK;
