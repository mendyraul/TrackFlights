CREATE TABLE IF NOT EXISTS public.airport_schedule_snapshots (
  airport text NOT NULL,
  board text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  flights jsonb NOT NULL,
  PRIMARY KEY (airport, board)
);
ALTER TABLE public.airport_schedule_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read schedules" ON public.airport_schedule_snapshots;
CREATE POLICY "Public read schedules" ON public.airport_schedule_snapshots FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.airport_schedule_snapshots FROM anon, authenticated;
GRANT SELECT ON public.airport_schedule_snapshots TO anon, authenticated;
GRANT ALL ON public.airport_schedule_snapshots TO service_role;
-- Explicit grants also repair projects without Supabase default table privileges.
GRANT SELECT ON public.traffic_hourly, public.traffic_forecast, public.ingestor_heartbeat TO anon, authenticated;
GRANT ALL ON public.traffic_hourly, public.traffic_forecast, public.ingestor_heartbeat TO service_role;
