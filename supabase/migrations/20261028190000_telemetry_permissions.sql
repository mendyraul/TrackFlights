-- Supabase installations can grant new tables broad default privileges.
-- Public readers need SELECT only, including when these tables already exist.
REVOKE ALL ON TABLE public.ingestor_heartbeat, public.traffic_hourly, public.traffic_forecast
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ingestor_heartbeat, public.traffic_hourly, public.traffic_forecast
  TO anon, authenticated;
GRANT ALL ON TABLE public.ingestor_heartbeat, public.traffic_hourly, public.traffic_forecast
  TO service_role;
