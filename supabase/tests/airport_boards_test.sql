DO $$ BEGIN
 IF NOT has_table_privilege('anon','airport_schedule_baselines','SELECT') THEN RAISE EXCEPTION 'baseline reads missing'; END IF;
 IF has_table_privilege('anon','airport_schedule_baselines','INSERT') THEN RAISE EXCEPTION 'public baseline writes'; END IF;
 IF has_table_privilege('authenticated','airport_flight_progress','UPDATE') THEN RAISE EXCEPTION 'public inference writes'; END IF;
END $$;
INSERT INTO airport_schedule_baselines (airport,service_date,board,fetched_at,flights) VALUES ('MIA','2026-11-04','scheduled_arrivals',now(),'[]'),('MIA','2026-11-05','scheduled_arrivals',now(),'[]');
INSERT INTO airport_flight_progress (airport,service_date,board,flight_key,state,observed_at) VALUES ('MIA','2026-11-04','scheduled_arrivals','flight1','Approaching',now());
DELETE FROM airport_schedule_baselines WHERE service_date = '2026-11-04';
DO $$ BEGIN
 IF EXISTS (SELECT FROM airport_flight_progress WHERE service_date='2026-11-04') THEN RAISE EXCEPTION 'orphaned progress'; END IF;
 IF NOT EXISTS (SELECT FROM airport_schedule_baselines WHERE service_date='2026-11-05') THEN RAISE EXCEPTION 'daily baseline overwritten'; END IF;
END $$;
DELETE FROM airport_schedule_baselines WHERE service_date='2026-11-05';
