-- Persistent alert storage for scraper failures.
CREATE TABLE scraper_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    error_type TEXT NOT NULL,  -- 'exception', 'zero_vessels', 'count_drop'
    error_message TEXT,
    expected_count INT,
    actual_count INT,
    status TEXT DEFAULT 'open',  -- 'open', 'investigating', 'resolved'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    investigated_by TEXT,
    fix_applied BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_scraper_alerts_status ON scraper_alerts(status);
CREATE INDEX idx_scraper_alerts_source ON scraper_alerts(source);
CREATE INDEX idx_scraper_alerts_created ON scraper_alerts(created_at DESC);

-- RLS: service role only (alert data includes error messages)
ALTER TABLE scraper_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role all" ON scraper_alerts
    FOR ALL USING (auth.role() = 'service_role');
