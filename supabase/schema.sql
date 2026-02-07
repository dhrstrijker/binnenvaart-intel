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

-- RLS: allow anonymous read access to vessels (free tier)
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read access" ON vessels FOR SELECT USING (true);

-- RLS: price_history only for premium subscribers
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Premium users can read price history"
  ON price_history FOR SELECT TO authenticated
  USING ((SELECT is_premium()));

-- Notification subscribers for email alerts
CREATE TABLE notification_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ,
  verification_token TEXT UNIQUE,
  unsubscribe_token TEXT UNIQUE,
  preferences JSONB DEFAULT '{"frequency": "immediate", "types": ["new", "price_change", "removed"]}'::jsonb
);

CREATE INDEX idx_notification_subscribers_user ON notification_subscribers(user_id);

ALTER TABLE notification_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read access" ON notification_subscribers FOR SELECT USING (true);
CREATE POLICY "Authenticated users can subscribe"
  ON notification_subscribers FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  polar_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Subscriptions table (synced from Polar webhooks)
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  polar_customer_id TEXT,
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  amount INTEGER,
  currency TEXT DEFAULT 'eur',
  recurring_interval TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);

-- Premium check function
CREATE OR REPLACE FUNCTION is_premium()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE user_id = (SELECT auth.uid())
    AND status IN ('active')
    AND current_period_end > NOW()
  );
$$;

-- Watchlist for tracking specific vessels
CREATE TABLE watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  vessel_id UUID REFERENCES vessels(id) NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  notify_price_change BOOLEAN DEFAULT TRUE,
  notify_status_change BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, vessel_id)
);

CREATE INDEX idx_watchlist_user ON watchlist(user_id);
CREATE INDEX idx_watchlist_vessel ON watchlist(vessel_id);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own watchlist"
  ON watchlist FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Notification history for tracking sent notifications
CREATE TABLE notification_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  vessel_ids UUID[] NOT NULL,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  resend_message_id TEXT
);

CREATE INDEX idx_notification_history_user ON notification_history(user_id);
CREATE INDEX idx_notification_history_sent_at ON notification_history(sent_at);
