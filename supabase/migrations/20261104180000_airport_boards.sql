CREATE TABLE IF NOT EXISTS public.airport_schedule_baselines (
 airport text NOT NULL CHECK (airport IN ('MIA','FLL','PBI','MCO','RSW')),
 service_date date NOT NULL,
 board text NOT NULL CHECK (board IN ('scheduled_arrivals','scheduled_departures')),
 fetched_at timestamptz NOT NULL,
 partial boolean NOT NULL DEFAULT true,
 page_limit integer NOT NULL DEFAULT 2,
 flights jsonb NOT NULL,
 PRIMARY KEY (airport,service_date,board)
);
CREATE TABLE IF NOT EXISTS public.airport_flight_progress (
 airport text NOT NULL,
 service_date date NOT NULL,
 board text NOT NULL,
 flight_key text NOT NULL,
 state text NOT NULL CHECK (state IN ('Approaching','Departing','Likely landed','Observed near airport')),
 observed_at timestamptz NOT NULL,
 evidence jsonb NOT NULL DEFAULT '{}',
 PRIMARY KEY (airport,service_date,board,flight_key),
 FOREIGN KEY (airport,service_date,board) REFERENCES airport_schedule_baselines ON DELETE CASCADE
);
ALTER TABLE public.airport_schedule_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airport_flight_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read baselines" ON public.airport_schedule_baselines;
CREATE POLICY "Public read baselines" ON public.airport_schedule_baselines FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public read progress" ON public.airport_flight_progress;
CREATE POLICY "Public read progress" ON public.airport_flight_progress FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.airport_schedule_baselines, public.airport_flight_progress FROM anon, authenticated;
GRANT SELECT ON public.airport_schedule_baselines, public.airport_flight_progress TO anon, authenticated;
GRANT ALL ON public.airport_schedule_baselines, public.airport_flight_progress TO service_role;
