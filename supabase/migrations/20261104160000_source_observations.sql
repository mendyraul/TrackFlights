-- Source-owned positions prevent schedule updates from refreshing receiver data.
CREATE TABLE IF NOT EXISTS public.aircraft_observations (
  source text NOT NULL CHECK (source IN ('adsb1090', 'flightaware')),
  aircraft_key text NOT NULL,
  observed_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  PRIMARY KEY (source, aircraft_key)
);
CREATE INDEX IF NOT EXISTS aircraft_observations_age ON public.aircraft_observations(observed_at DESC);
ALTER TABLE public.aircraft_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read observations" ON public.aircraft_observations;
CREATE POLICY "Public read observations" ON public.aircraft_observations FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.aircraft_observations FROM anon, authenticated;
GRANT SELECT ON public.aircraft_observations TO anon, authenticated;
GRANT ALL ON public.aircraft_observations TO service_role;

-- Atomically replace the daily provider snapshot, including an empty snapshot.
-- A successful refresh must not accumulate yesterday's aircraft.
CREATE OR REPLACE FUNCTION public.replace_regional_observations(p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM aircraft_observations WHERE source = 'flightaware';
  INSERT INTO aircraft_observations(source, aircraft_key, observed_at, fetched_at, payload)
  SELECT 'flightaware', r.aircraft_key, r.observed_at, r.fetched_at, r.payload
  FROM jsonb_to_recordset(p_rows) AS r(aircraft_key text, observed_at timestamptz, fetched_at timestamptz, payload jsonb);
END $$;
REVOKE ALL ON FUNCTION public.replace_regional_observations(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_regional_observations(jsonb) TO service_role;
