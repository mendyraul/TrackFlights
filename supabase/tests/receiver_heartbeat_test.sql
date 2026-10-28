BEGIN;
INSERT INTO public.ingestor_heartbeat VALUES ('adsb1090', NOW(), 0, 0, 0);
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.ingestor_heartbeat) <> 1 THEN
    RAISE EXCEPTION 'Public reader cannot see receiver heartbeat';
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_table_privilege('anon', 'public.ingestor_heartbeat', 'INSERT')
     OR has_table_privilege('anon', 'public.ingestor_heartbeat', 'UPDATE')
     OR has_table_privilege('anon', 'public.ingestor_heartbeat', 'DELETE')
     OR has_table_privilege('authenticated', 'public.ingestor_heartbeat', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ingestor_heartbeat', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ingestor_heartbeat', 'DELETE') THEN
    RAISE EXCEPTION 'Public role can write heartbeat data';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.ingestor_heartbeat', 'INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Ingestor writer is missing privileges';
  END IF;
END $$;
ROLLBACK;
