-- Weather alongside each traffic hour, as features for the traffic forecast.
-- weather_snapshots is pruned after a few days, so the forecast's training
-- data has to carry its own copy of the conditions for each hour.

ALTER TABLE traffic_hourly
  ADD COLUMN IF NOT EXISTS temp_c REAL,
  ADD COLUMN IF NOT EXISTS wind_kt REAL,
  ADD COLUMN IF NOT EXISTS gust_kt REAL,
  ADD COLUMN IF NOT EXISTS precip_mm REAL,
  ADD COLUMN IF NOT EXISTS visibility_km REAL,
  ADD COLUMN IF NOT EXISTS is_thunderstorm BOOLEAN;

-- New signature: the old one is dropped so PostgREST resolves one function.
DROP FUNCTION IF EXISTS record_traffic_hour(
  timestamptz, integer, integer, integer, integer, integer, integer, real, integer
);

CREATE OR REPLACE FUNCTION record_traffic_hour(
  p_hour TIMESTAMPTZ,
  p_unique_aircraft INTEGER,
  p_arriving INTEGER,
  p_departing INTEGER,
  p_overflights INTEGER,
  p_on_ground INTEGER,
  p_peak_concurrent INTEGER,
  p_max_range_km REAL,
  p_polls INTEGER,
  p_temp_c REAL DEFAULT NULL,
  p_wind_kt REAL DEFAULT NULL,
  p_gust_kt REAL DEFAULT NULL,
  p_precip_mm REAL DEFAULT NULL,
  p_visibility_km REAL DEFAULT NULL,
  p_is_thunderstorm BOOLEAN DEFAULT NULL
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO traffic_hourly AS t (
    hour, unique_aircraft, arriving, departing, overflights, on_ground,
    peak_concurrent, max_range_km, polls,
    temp_c, wind_kt, gust_kt, precip_mm, visibility_km, is_thunderstorm, updated_at
  ) VALUES (
    date_trunc('hour', p_hour), p_unique_aircraft, p_arriving, p_departing,
    p_overflights, p_on_ground, p_peak_concurrent, p_max_range_km, p_polls,
    p_temp_c, p_wind_kt, p_gust_kt, p_precip_mm, p_visibility_km, p_is_thunderstorm, NOW()
  )
  ON CONFLICT (hour) DO UPDATE SET
    -- Counts: GREATEST, so a mid-hour restart can't shrink the hour.
    unique_aircraft = GREATEST(t.unique_aircraft, EXCLUDED.unique_aircraft),
    arriving = GREATEST(t.arriving, EXCLUDED.arriving),
    departing = GREATEST(t.departing, EXCLUDED.departing),
    overflights = GREATEST(t.overflights, EXCLUDED.overflights),
    on_ground = GREATEST(t.on_ground, EXCLUDED.on_ground),
    peak_concurrent = GREATEST(t.peak_concurrent, EXCLUDED.peak_concurrent),
    max_range_km = GREATEST(t.max_range_km, EXCLUDED.max_range_km),
    polls = GREATEST(t.polls, EXCLUDED.polls),
    -- Weather: latest reading wins, but never overwrite with a gap.
    temp_c = COALESCE(EXCLUDED.temp_c, t.temp_c),
    wind_kt = COALESCE(EXCLUDED.wind_kt, t.wind_kt),
    gust_kt = COALESCE(EXCLUDED.gust_kt, t.gust_kt),
    precip_mm = COALESCE(EXCLUDED.precip_mm, t.precip_mm),
    visibility_km = COALESCE(EXCLUDED.visibility_km, t.visibility_km),
    is_thunderstorm = COALESCE(EXCLUDED.is_thunderstorm, t.is_thunderstorm),
    updated_at = NOW();
$$;

REVOKE EXECUTE ON FUNCTION record_traffic_hour(
  timestamptz, integer, integer, integer, integer, integer, integer, real, integer,
  real, real, real, real, real, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_traffic_hour(
  timestamptz, integer, integer, integer, integer, integer, integer, real, integer,
  real, real, real, real, real, boolean
) TO service_role;

COMMENT ON TABLE delay_predictions IS
  'Unused since 2026-10: the rules-based delay predictor was removed. Kept so old migrations stay valid.';
