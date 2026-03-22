-- MIA Flight Tracker: Initial Schema
-- ==================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------
-- Reference Tables
-- ---------------------

CREATE TABLE airlines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  iata_code VARCHAR(3) UNIQUE NOT NULL,
  icao_code VARCHAR(4) UNIQUE,
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  country VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE aircraft (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  icao_type_code VARCHAR(10) UNIQUE NOT NULL,
  model VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255),
  category VARCHAR(50), -- 'narrow_body', 'wide_body', 'regional', 'cargo', 'general'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE airports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  iata_code VARCHAR(3) UNIQUE NOT NULL,
  icao_code VARCHAR(4) UNIQUE,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255),
  country VARCHAR(100),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timezone VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------
-- Flight Tables
-- ---------------------

CREATE TYPE flight_status AS ENUM (
  'scheduled',
  'en_route',
  'landed',
  'arrived',
  'departed',
  'cancelled',
  'diverted',
  'delayed',
  'unknown'
);

CREATE TYPE flight_direction AS ENUM ('arrival', 'departure');

CREATE TABLE flights_current (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identifiers
  flight_iata VARCHAR(10) NOT NULL,
  flight_icao VARCHAR(10),
  flight_number VARCHAR(10),

  -- Airline
  airline_iata VARCHAR(3) REFERENCES airlines(iata_code),
  airline_name VARCHAR(255),

  -- Aircraft
  aircraft_icao VARCHAR(10),
  aircraft_registration VARCHAR(20),

  -- Route
  direction flight_direction NOT NULL,
  origin_iata VARCHAR(3),
  origin_name VARCHAR(255),
  destination_iata VARCHAR(3),
  destination_name VARCHAR(255),

  -- Schedule
  scheduled_departure TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  scheduled_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  estimated_arrival TIMESTAMPTZ,

  -- Status
  status flight_status DEFAULT 'scheduled',
  delay_minutes INTEGER DEFAULT 0,

  -- Position (for map)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude_ft INTEGER,
  heading DOUBLE PRECISION,
  ground_speed_knots INTEGER,
  vertical_speed_fpm INTEGER,

  -- Gate info
  departure_terminal VARCHAR(10),
  departure_gate VARCHAR(10),
  arrival_terminal VARCHAR(10),
  arrival_gate VARCHAR(10),
  baggage_belt VARCHAR(10),

  -- Metadata
  data_source VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for upserts
  UNIQUE(flight_iata, scheduled_departure)
);

CREATE TABLE flights_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  flight_iata VARCHAR(10) NOT NULL,
  flight_icao VARCHAR(10),
  flight_number VARCHAR(10),

  airline_iata VARCHAR(3),
  airline_name VARCHAR(255),

  aircraft_icao VARCHAR(10),
  aircraft_registration VARCHAR(20),

  direction flight_direction NOT NULL,
  origin_iata VARCHAR(3),
  origin_name VARCHAR(255),
  destination_iata VARCHAR(3),
  destination_name VARCHAR(255),

  scheduled_departure TIMESTAMPTZ,
  actual_departure TIMESTAMPTZ,
  scheduled_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,

  status flight_status,
  delay_minutes INTEGER DEFAULT 0,

  departure_terminal VARCHAR(10),
  departure_gate VARCHAR(10),
  arrival_terminal VARCHAR(10),
  arrival_gate VARCHAR(10),

  data_source VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------
-- Analytics Tables
-- ---------------------

CREATE TABLE analytics_hourly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hour TIMESTAMPTZ NOT NULL,
  direction flight_direction NOT NULL,

  total_flights INTEGER DEFAULT 0,
  on_time INTEGER DEFAULT 0,
  delayed INTEGER DEFAULT 0,
  cancelled INTEGER DEFAULT 0,
  diverted INTEGER DEFAULT 0,
  avg_delay_minutes DOUBLE PRECISION DEFAULT 0,
  max_delay_minutes INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hour, direction)
);

CREATE TABLE analytics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  direction flight_direction NOT NULL,

  total_flights INTEGER DEFAULT 0,
  on_time INTEGER DEFAULT 0,
  delayed INTEGER DEFAULT 0,
  cancelled INTEGER DEFAULT 0,
  diverted INTEGER DEFAULT 0,
  avg_delay_minutes DOUBLE PRECISION DEFAULT 0,
  max_delay_minutes INTEGER DEFAULT 0,

  top_delayed_airline VARCHAR(3),
  busiest_hour INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, direction)
);

-- ---------------------
-- Indexes
-- ---------------------

CREATE INDEX idx_flights_current_flight_iata ON flights_current(flight_iata);
CREATE INDEX idx_flights_current_airline ON flights_current(airline_iata);
CREATE INDEX idx_flights_current_status ON flights_current(status);
CREATE INDEX idx_flights_current_direction ON flights_current(direction);
CREATE INDEX idx_flights_current_scheduled_arrival ON flights_current(scheduled_arrival);
CREATE INDEX idx_flights_current_scheduled_departure ON flights_current(scheduled_departure);
CREATE INDEX idx_flights_current_updated_at ON flights_current(updated_at);

CREATE INDEX idx_flights_history_flight_iata ON flights_history(flight_iata);
CREATE INDEX idx_flights_history_archived_at ON flights_history(archived_at);
CREATE INDEX idx_flights_history_direction ON flights_history(direction);

CREATE INDEX idx_analytics_hourly_hour ON analytics_hourly(hour);
CREATE INDEX idx_analytics_daily_date ON analytics_daily(date);

-- ---------------------
-- Row Level Security
-- ---------------------

ALTER TABLE airlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE aircraft ENABLE ROW LEVEL SECURITY;
ALTER TABLE airports ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;

-- Public read access (anonymous users)
CREATE POLICY "Public read airlines" ON airlines FOR SELECT USING (true);
CREATE POLICY "Public read aircraft" ON aircraft FOR SELECT USING (true);
CREATE POLICY "Public read airports" ON airports FOR SELECT USING (true);
CREATE POLICY "Public read flights_current" ON flights_current FOR SELECT USING (true);
CREATE POLICY "Public read flights_history" ON flights_history FOR SELECT USING (true);
CREATE POLICY "Public read analytics_hourly" ON analytics_hourly FOR SELECT USING (true);
CREATE POLICY "Public read analytics_daily" ON analytics_daily FOR SELECT USING (true);

-- Service role has full access via default Supabase service_role key (bypasses RLS)

-- ---------------------
-- Updated_at trigger
-- ---------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flights_current_updated_at
  BEFORE UPDATE ON flights_current
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------
-- Enable Realtime
-- ---------------------

ALTER PUBLICATION supabase_realtime ADD TABLE flights_current;
