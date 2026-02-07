-- Track every scraper run for reliable circuit breaker baselines.
CREATE TABLE scraper_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    vessel_count INT NOT NULL,
    duration_ms INT,
    status TEXT DEFAULT 'success',  -- 'success', 'error', 'blocked'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scraper_runs_source_created ON scraper_runs(source, created_at DESC);

-- RLS: service role only (no public reads needed)
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role all" ON scraper_runs
    FOR ALL USING (auth.role() = 'service_role');
