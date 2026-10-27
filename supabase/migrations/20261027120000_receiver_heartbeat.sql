-- Additive and compatible with the existing unpublished ml-models schema.
CREATE TABLE IF NOT EXISTS public.ingestor_heartbeat (
  source TEXT PRIMARY KEY,
  last_poll_at TIMESTAMPTZ NOT NULL,
  aircraft_received INTEGER NOT NULL DEFAULT 0,
  aircraft_in_range INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.ingestor_heartbeat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read ingestor_heartbeat" ON public.ingestor_heartbeat;
CREATE POLICY "Public read ingestor_heartbeat"
  ON public.ingestor_heartbeat FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.ingestor_heartbeat TO anon, authenticated;
GRANT ALL ON public.ingestor_heartbeat TO service_role;
