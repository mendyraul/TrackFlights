BEGIN;
DO $$
DECLARE reader TEXT; tbl TEXT; privilege TEXT;
BEGIN
  FOREACH reader IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH tbl IN ARRAY ARRAY['ingestor_heartbeat', 'traffic_hourly', 'traffic_forecast'] LOOP
      IF NOT has_table_privilege(reader, 'public.' || tbl, 'SELECT') THEN
        RAISE EXCEPTION '% cannot read %', reader, tbl;
      END IF;
      FOREACH privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(reader, 'public.' || tbl, privilege) THEN
          RAISE EXCEPTION '% has unexpected % privilege on %', reader, privilege, tbl;
        END IF;
      END LOOP;
      IF NOT has_table_privilege('service_role', 'public.' || tbl, 'INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'Ingestor cannot write %', tbl;
      END IF;
    END LOOP;
  END LOOP;
END $$;
ROLLBACK;
