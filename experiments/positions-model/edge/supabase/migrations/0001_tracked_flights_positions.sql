-- TrackFlights positions model: parent tracked_flights + child flight_positions
-- + receiver_stations. Run in the Supabase SQL Editor (or via the Supabase CLI).
--
-- Design:
--   * tracked_flights   — one row per aircraft (ICAO 24-bit hex), holds the LATEST
--                         state. This is what the map reads (cheap: one row/flight).
--   * flight_positions  — append-only time-series trail (one row per captured sample).
--   * receiver_stations — this Pi's coordinates, auto-registered from the GPS HAT.
--
-- RLS: anon = read-only (browser/Vercel anon key); the ingestor uses the service
-- role key, which bypasses RLS, to write.

-- ----------------------------------------------------------------------------
-- Parent: latest state, one row per airframe
-- ----------------------------------------------------------------------------
create table if not exists tracked_flights (
  hex                 text primary key,                       -- ICAO 24-bit address (stable id)
  callsign            text,
  registration        text,
  aircraft_type       text,
  origin              text,
  destination         text,
  -- denormalized latest sample (so the map needs a single read)
  latitude            double precision,
  longitude           double precision,
  altitude_ft         integer,
  ground_speed_knots  integer,
  track_deg           double precision,
  vertical_rate_fpm   integer,
  on_ground           boolean not null default false,
  station_id          text,
  first_seen          timestamptz not null default now(),
  last_seen           timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists tracked_flights_last_seen_idx
  on tracked_flights (last_seen desc);

-- ----------------------------------------------------------------------------
-- Child: append-only position trail
-- ----------------------------------------------------------------------------
create table if not exists flight_positions (
  id                  bigint generated always as identity primary key,
  hex                 text not null references tracked_flights (hex) on delete cascade,
  latitude            double precision not null,
  longitude           double precision not null,
  altitude_ft         integer,
  ground_speed_knots  integer,
  track_deg           double precision,
  vertical_rate_fpm   integer,
  station_id          text,
  recorded_at         timestamptz not null default now()
);

create index if not exists flight_positions_hex_time_idx
  on flight_positions (hex, recorded_at desc);
create index if not exists flight_positions_recorded_at_idx
  on flight_positions (recorded_at desc);

-- ----------------------------------------------------------------------------
-- Receiver station registry (auto-filled from the GPS HAT)
-- ----------------------------------------------------------------------------
create table if not exists receiver_stations (
  station_id          text primary key,
  latitude            double precision,
  longitude           double precision,
  altitude_m          double precision,
  last_updated        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security: public read-only; service role writes (bypasses RLS)
-- ----------------------------------------------------------------------------
alter table tracked_flights   enable row level security;
alter table flight_positions  enable row level security;
alter table receiver_stations enable row level security;

create policy "public read tracked_flights"
  on tracked_flights for select using (true);
create policy "public read flight_positions"
  on flight_positions for select using (true);
create policy "public read receiver_stations"
  on receiver_stations for select using (true);

-- Optional: expose the map table to Supabase realtime (kept OFF in the app for
-- egress reasons, but available if you switch to subscriptions later).
-- alter publication supabase_realtime add table tracked_flights;
