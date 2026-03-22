-- Phase 4: Weather, Predictions, and Anomaly Detection
-- =====================================================

-- ---------------------
-- Weather Snapshots
-- ---------------------

CREATE TABLE weather_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  airport_iata VARCHAR(3) NOT NULL DEFAULT 'MIA',
  observed_at TIMESTAMPTZ NOT NULL,

  -- Temperature
  temperature_c DOUBLE PRECISION,
  feels_like_c DOUBLE PRECISION,

  -- Wind
  wind_speed_knots DOUBLE PRECISION,
  wind_direction_deg INTEGER,
  wind_gust_knots DOUBLE PRECISION,

  -- Visibility & precipitation
  visibility_km DOUBLE PRECISION,
  precipitation_mm DOUBLE PRECISION,
  precipitation_probability DOUBLE PRECISION, -- 0.0 - 1.0
  humidity_pct DOUBLE PRECISION,

  -- Cloud & storms
  cloud_coverage_pct DOUBLE PRECISION,
  weather_code INTEGER,           -- WMO weather code
  weather_description VARCHAR(100),

  -- Storm indicators
  is_thunderstorm BOOLEAN DEFAULT FALSE,
  is_fog BOOLEAN DEFAULT FALSE,
  is_freezing BOOLEAN DEFAULT FALSE,

  -- Pressure
  pressure_hpa DOUBLE PRECISION,

  -- Metadata
  data_source VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(airport_iata, observed_at)
);

CREATE INDEX idx_weather_snapshots_observed ON weather_snapshots(observed_at DESC);
CREATE INDEX idx_weather_snapshots_airport ON weather_snapshots(airport_iata, observed_at DESC);

-- ---------------------
-- Delay Predictions
-- ---------------------

CREATE TYPE prediction_type AS ENUM (
  'delay_risk',
  'delay_minutes',
  'on_time_probability',
  'cancellation_risk'
);

CREATE TABLE delay_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Flight reference
  flight_iata VARCHAR(10) NOT NULL,
  scheduled_departure TIMESTAMPTZ,
  direction VARCHAR(10) NOT NULL, -- 'arrival' or 'departure'

  -- Prediction
  prediction_type prediction_type NOT NULL,
  predicted_value DOUBLE PRECISION NOT NULL, -- score 0-1 or minutes
  confidence DOUBLE PRECISION,               -- 0.0 - 1.0

  -- Contributing factors
  factors JSONB, -- {"weather": 0.4, "carrier_history": 0.3, "time_of_day": 0.2, "traffic": 0.1}

  -- Model metadata
  model_version VARCHAR(50) DEFAULT 'rules-v1',
  feature_snapshot JSONB, -- snapshot of input features for debugging

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- predictions become stale

  UNIQUE(flight_iata, scheduled_departure, prediction_type)
);

CREATE INDEX idx_predictions_flight ON delay_predictions(flight_iata, scheduled_departure);
CREATE INDEX idx_predictions_type ON delay_predictions(prediction_type);
CREATE INDEX idx_predictions_value ON delay_predictions(predicted_value DESC);
CREATE INDEX idx_predictions_created ON delay_predictions(created_at DESC);
CREATE INDEX idx_predictions_expires ON delay_predictions(expires_at);

-- ---------------------
-- Traffic Anomalies
-- ---------------------

CREATE TYPE anomaly_type AS ENUM (
  'arrival_spike',
  'departure_spike',
  'mass_delay',
  'delay_distribution_shift',
  'congestion',
  'unusual_cancellations',
  'weather_impact'
);

CREATE TYPE anomaly_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE traffic_anomalies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  anomaly_type anomaly_type NOT NULL,
  severity anomaly_severity NOT NULL DEFAULT 'low',

  -- Description
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Affected scope
  affected_flights JSONB DEFAULT '[]',     -- array of flight_iata strings
  affected_airlines JSONB DEFAULT '[]',    -- array of airline_iata strings
  affected_count INTEGER DEFAULT 0,

  -- Detection details
  metric_name VARCHAR(100),  -- e.g., "arrivals_per_hour", "avg_delay_minutes"
  metric_value DOUBLE PRECISION,
  baseline_value DOUBLE PRECISION,
  deviation_pct DOUBLE PRECISION,

  -- Weather context
  weather_snapshot_id UUID REFERENCES weather_snapshots(id),

  -- Lifecycle
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  detection_model VARCHAR(50) DEFAULT 'rules-v1',
  raw_evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_type ON traffic_anomalies(anomaly_type);
CREATE INDEX idx_anomalies_severity ON traffic_anomalies(severity);
CREATE INDEX idx_anomalies_active ON traffic_anomalies(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_anomalies_detected ON traffic_anomalies(detected_at DESC);

-- ---------------------
-- Row Level Security
-- ---------------------

ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE delay_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read weather" ON weather_snapshots FOR SELECT USING (true);
CREATE POLICY "Public read predictions" ON delay_predictions FOR SELECT USING (true);
CREATE POLICY "Public read anomalies" ON traffic_anomalies FOR SELECT USING (true);

-- ---------------------
-- Enable Realtime on anomalies (alerts)
-- ---------------------

ALTER PUBLICATION supabase_realtime ADD TABLE traffic_anomalies;
