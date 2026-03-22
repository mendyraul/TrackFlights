-- Seed: MIA airport
INSERT INTO airports (iata_code, icao_code, name, city, country, latitude, longitude, timezone)
VALUES ('MIA', 'KMIA', 'Miami International Airport', 'Miami', 'United States', 25.7959, -80.2870, 'America/New_York')
ON CONFLICT (iata_code) DO NOTHING;

-- Seed: Common airlines operating at MIA
INSERT INTO airlines (iata_code, icao_code, name, country) VALUES
  ('AA', 'AAL', 'American Airlines', 'United States'),
  ('DL', 'DAL', 'Delta Air Lines', 'United States'),
  ('UA', 'UAL', 'United Airlines', 'United States'),
  ('B6', 'JBU', 'JetBlue Airways', 'United States'),
  ('NK', 'NKS', 'Spirit Airlines', 'United States'),
  ('F9', 'FFT', 'Frontier Airlines', 'United States'),
  ('LA', 'LAN', 'LATAM Airlines', 'Chile'),
  ('AV', 'AVA', 'Avianca', 'Colombia'),
  ('CM', 'CMP', 'Copa Airlines', 'Panama'),
  ('BA', 'BAW', 'British Airways', 'United Kingdom'),
  ('LH', 'DLH', 'Lufthansa', 'Germany'),
  ('IB', 'IBE', 'Iberia', 'Spain'),
  ('AF', 'AFR', 'Air France', 'France'),
  ('EK', 'UAE', 'Emirates', 'United Arab Emirates'),
  ('QR', 'QTR', 'Qatar Airways', 'Qatar')
ON CONFLICT (iata_code) DO NOTHING;
