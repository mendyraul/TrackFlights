DO $$ BEGIN
 IF NOT has_table_privilege('anon', 'aircraft_observations', 'SELECT') THEN RAISE EXCEPTION 'anon must read observations'; END IF;
 IF has_table_privilege('anon', 'aircraft_observations', 'INSERT') THEN RAISE EXCEPTION 'anon must not write observations'; END IF;
 IF has_table_privilege('authenticated', 'airport_schedule_snapshots', 'UPDATE') THEN RAISE EXCEPTION 'public must not write schedules'; END IF;
 IF NOT has_table_privilege('service_role', 'aircraft_observations', 'INSERT') THEN RAISE EXCEPTION 'service must write observations'; END IF;
END $$;

DO $$ BEGIN
 IF has_function_privilege('anon', 'replace_regional_observations(jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'public snapshot mutation'; END IF;
END $$;
SELECT replace_regional_observations('[{"aircraft_key":"one","observed_at":"2026-11-04T12:00:00Z","fetched_at":"2026-11-04T12:00:00Z","payload":{}}]'::jsonb);
SELECT replace_regional_observations('[]'::jsonb);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM aircraft_observations WHERE source = 'flightaware') THEN RAISE EXCEPTION 'old snapshot retained'; END IF;
END $$;
