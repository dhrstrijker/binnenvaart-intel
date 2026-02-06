-- Binnenvaart Intel - Supabase Schema
-- Tracks inland shipping vessels listed by Dutch brokers

-- Main vessels table (all prices in EUR, no currency field needed)
CREATE TABLE vessels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  length_m NUMERIC,
  width_m NUMERIC,
  tonnage NUMERIC,
  build_year INTEGER,
  price NUMERIC,
  url TEXT,
  image_url TEXT,
  source TEXT NOT NULL,
  source_id TEXT,
  raw_details JSONB DEFAULT NULL,
  image_urls JSONB DEFAULT NULL,
  canonical_vessel_id UUID REFERENCES vessels(id) ON DELETE SET NULL,
  linked_sources JSONB DEFAULT NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_id)
);

-- Price history table for tracking changes over time
CREATE TABLE price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID REFERENCES vessels(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_history_vessel ON price_history(vessel_id);
CREATE INDEX idx_price_history_recorded ON price_history(recorded_at);

-- Indices for frontend filter columns
CREATE INDEX idx_vessels_source ON vessels(source);
CREATE INDEX idx_vessels_type ON vessels(type);
CREATE INDEX idx_vessels_price ON vessels(price);
CREATE INDEX idx_vessels_build_year ON vessels(build_year);
CREATE INDEX idx_vessels_raw_details ON vessels USING gin (raw_details);
CREATE INDEX idx_vessels_canonical ON vessels(canonical_vessel_id);

-- RLS: allow anonymous read access to both tables
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read access" ON vessels FOR SELECT USING (true);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read access" ON price_history FOR SELECT USING (true);

-- Notification subscribers for email alerts
CREATE TABLE notification_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);

ALTER TABLE notification_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read access" ON notification_subscribers FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert" ON notification_subscribers FOR INSERT WITH CHECK (true);
