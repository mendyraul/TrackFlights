-- traffic_forecast: readable by anon, writable only by service_role.
BEGIN;
INSERT INTO traffic_forecast (hour, predicted_aircraft, model_version)
VALUES ('2026-10-20 15:00Z', 31.5, 'test');

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(*) FROM traffic_forecast) <> 1 THEN
    RAISE EXCEPTION 'anon cannot read traffic_forecast';
  END IF;
  BEGIN
    INSERT INTO traffic_forecast (hour, predicted_aircraft, model_version)
    VALUES ('2026-10-20 16:00Z', 1, 'evil');
    RAISE EXCEPTION 'anon was able to write traffic_forecast';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: RLS has no insert policy
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('anon', 'prune_traffic_forecast()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can call prune_traffic_forecast';
  END IF;
END $$;
ROLLBACK;
