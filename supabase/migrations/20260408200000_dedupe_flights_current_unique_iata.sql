-- Ensure one active row per flight_iata in flights_current

-- 1) Remove older duplicates, keep latest updated_at per flight_iata
WITH ranked AS (
  SELECT
    id,
    flight_iata,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY flight_iata
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM flights_current
)
DELETE FROM flights_current f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

-- 2) Replace old uniqueness rule with single-row uniqueness by flight_iata
ALTER TABLE flights_current
  DROP CONSTRAINT IF EXISTS flights_current_flight_iata_scheduled_departure_key;

CREATE UNIQUE INDEX IF NOT EXISTS flights_current_flight_iata_key
  ON flights_current (flight_iata);
