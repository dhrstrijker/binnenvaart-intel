-- Scraper pipeline v2 foundations: staging, diff/apply, source health, and metrics.

CREATE TABLE IF NOT EXISTS scrape_runs_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'authoritative')),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error', 'blocked')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    external_request_count INT NOT NULL DEFAULT 0,
    supabase_read_count INT NOT NULL DEFAULT 0,
    supabase_write_count INT NOT NULL DEFAULT 0,
    parse_fail_count INT NOT NULL DEFAULT 0,
    selector_fail_count INT NOT NULL DEFAULT 0,
    detail_fetch_count INT NOT NULL DEFAULT 0,
    staged_count INT NOT NULL DEFAULT 0,
    inserted_count INT NOT NULL DEFAULT 0,
    price_changed_count INT NOT NULL DEFAULT 0,
    sold_count INT NOT NULL DEFAULT 0,
    removed_count INT NOT NULL DEFAULT 0,
    unchanged_count INT NOT NULL DEFAULT 0,
    run_duration_seconds NUMERIC,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_v2_source_started
    ON scrape_runs_v2(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_v2_status
    ON scrape_runs_v2(status);

CREATE TABLE IF NOT EXISTS scrape_source_health_v2 (
    source TEXT PRIMARY KEY,
    trailing_median_count NUMERIC,
    trailing_p95_count NUMERIC,
    last_vessel_count INT,
    last_run_status TEXT,
    last_run_at TIMESTAMPTZ,
    last_parse_fail_ratio NUMERIC,
    last_selector_fail_count INT,
    consecutive_healthy_runs INT NOT NULL DEFAULT 0,
    consecutive_unhealthy_runs INT NOT NULL DEFAULT 0,
    consecutive_miss_candidates INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_listing_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs_v2(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    listing_payload JSONB NOT NULL,
    listing_fingerprint TEXT NOT NULL,
    is_sold BOOLEAN,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_scrape_listing_staging_run_source
    ON scrape_listing_staging(run_id, source);
CREATE INDEX IF NOT EXISTS idx_scrape_listing_staging_lookup
    ON scrape_listing_staging(source, source_id);

CREATE TABLE IF NOT EXISTS scrape_vessel_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs_v2(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    vessel_payload JSONB NOT NULL,
    canonical_fingerprint TEXT NOT NULL,
    is_sold BOOLEAN NOT NULL DEFAULT FALSE,
    parse_ok BOOLEAN NOT NULL DEFAULT TRUE,
    parse_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_scrape_vessel_staging_run_source
    ON scrape_vessel_staging(run_id, source);
CREATE INDEX IF NOT EXISTS idx_scrape_vessel_staging_lookup
    ON scrape_vessel_staging(source, source_id);

CREATE TABLE IF NOT EXISTS scrape_diff_events_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs_v2(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    vessel_id UUID REFERENCES vessels(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('inserted', 'price_changed', 'sold', 'removed', 'unchanged')),
    old_price NUMERIC,
    new_price NUMERIC,
    old_status TEXT,
    new_status TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_scrape_diff_events_v2_run_source
    ON scrape_diff_events_v2(run_id, source);
CREATE INDEX IF NOT EXISTS idx_scrape_diff_events_v2_event
    ON scrape_diff_events_v2(event_type);

ALTER TABLE scrape_runs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_source_health_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_listing_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_vessel_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_diff_events_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role all" ON scrape_runs_v2;
CREATE POLICY "Allow service role all" ON scrape_runs_v2
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_source_health_v2;
CREATE POLICY "Allow service role all" ON scrape_source_health_v2
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_listing_staging;
CREATE POLICY "Allow service role all" ON scrape_listing_staging
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_vessel_staging;
CREATE POLICY "Allow service role all" ON scrape_vessel_staging
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_diff_events_v2;
CREATE POLICY "Allow service role all" ON scrape_diff_events_v2
    FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION compute_scrape_diff(run_id UUID, source TEXT)
RETURNS SETOF scrape_diff_events_v2
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Clear previously computed events for idempotency.
    DELETE FROM scrape_diff_events_v2 d
     WHERE d.run_id = compute_scrape_diff.run_id
       AND d.source = compute_scrape_diff.source;

    -- Events for rows seen in staging.
    INSERT INTO scrape_diff_events_v2 (
        run_id, source, source_id, vessel_id, event_type,
        old_price, new_price, old_status, new_status, payload
    )
    SELECT
        s.run_id,
        s.source,
        s.source_id,
        v.id,
        CASE
            WHEN v.id IS NULL THEN 'inserted'
            WHEN COALESCE(v.status, 'active') <> 'sold' AND COALESCE(s.is_sold, FALSE) = TRUE THEN 'sold'
            WHEN v.price IS DISTINCT FROM NULLIF((s.vessel_payload->>'price')::numeric, NULL) THEN 'price_changed'
            ELSE 'unchanged'
        END AS event_type,
        v.price,
        NULLIF((s.vessel_payload->>'price')::numeric, NULL),
        v.status,
        CASE WHEN COALESCE(s.is_sold, FALSE) THEN 'sold' ELSE 'active' END,
        s.vessel_payload
    FROM scrape_vessel_staging s
    LEFT JOIN vessels v
      ON v.source = s.source
     AND v.source_id = s.source_id
    WHERE s.run_id = compute_scrape_diff.run_id
      AND s.source = compute_scrape_diff.source;

    -- Removed candidates: active vessels not seen in this run.
    INSERT INTO scrape_diff_events_v2 (
        run_id, source, source_id, vessel_id, event_type,
        old_price, new_price, old_status, new_status, payload
    )
    SELECT
        compute_scrape_diff.run_id,
        compute_scrape_diff.source,
        v.source_id,
        v.id,
        'removed',
        v.price,
        NULL,
        v.status,
        'removed',
        jsonb_build_object(
            'name', v.name,
            'source', v.source,
            'source_id', v.source_id,
            'removed_by', 'v2_missing_from_staging'
        )
    FROM vessels v
    WHERE v.source = compute_scrape_diff.source
      AND v.status = 'active'
      AND NOT EXISTS (
          SELECT 1
          FROM scrape_vessel_staging s
          WHERE s.run_id = compute_scrape_diff.run_id
            AND s.source = compute_scrape_diff.source
            AND s.source_id = v.source_id
      )
    ON CONFLICT (run_id, source, source_id) DO NOTHING;

    RETURN QUERY
    SELECT *
      FROM scrape_diff_events_v2 d
     WHERE d.run_id = compute_scrape_diff.run_id
       AND d.source = compute_scrape_diff.source
     ORDER BY d.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION mark_missing_candidates(run_id UUID, source TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_count INT := 0;
BEGIN
    UPDATE scrape_source_health_v2 h
       SET consecutive_miss_candidates = COALESCE(consecutive_miss_candidates, 0) + 1,
           updated_at = NOW()
     WHERE h.source = mark_missing_candidates.source
       AND EXISTS (
           SELECT 1
           FROM scrape_diff_events_v2 d
           WHERE d.run_id = mark_missing_candidates.run_id
             AND d.source = mark_missing_candidates.source
             AND d.event_type = 'removed'
       );

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    INSERT INTO scrape_source_health_v2 (source, consecutive_miss_candidates, updated_at)
    SELECT mark_missing_candidates.source, 1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM scrape_source_health_v2 h WHERE h.source = mark_missing_candidates.source)
      AND EXISTS (
           SELECT 1
           FROM scrape_diff_events_v2 d
           WHERE d.run_id = mark_missing_candidates.run_id
             AND d.source = mark_missing_candidates.source
             AND d.event_type = 'removed'
      );

    RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION apply_scrape_diff(run_id UUID, source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    event_counts JSONB := '{}'::jsonb;
    consecutive_removed_threshold INT := 2;
    misses INT := 0;
BEGIN
    SELECT COALESCE(consecutive_miss_candidates, 0)
      INTO misses
      FROM scrape_source_health_v2
     WHERE scrape_source_health_v2.source = apply_scrape_diff.source;

    FOR r IN
        SELECT *
        FROM scrape_diff_events_v2 d
        WHERE d.run_id = apply_scrape_diff.run_id
          AND d.source = apply_scrape_diff.source
        ORDER BY d.created_at ASC
    LOOP
        IF r.event_type = 'inserted' THEN
            INSERT INTO vessels (
                source, source_id, name, type, length_m, width_m,
                tonnage, build_year, price, url, image_url, raw_details,
                image_urls, status, scraped_at, updated_at
            ) VALUES (
                r.source,
                r.source_id,
                r.payload->>'name',
                r.payload->>'type',
                NULLIF(r.payload->>'length_m', '')::numeric,
                NULLIF(r.payload->>'width_m', '')::numeric,
                NULLIF(r.payload->>'tonnage', '')::numeric,
                NULLIF(r.payload->>'build_year', '')::int,
                NULLIF(r.payload->>'price', '')::numeric,
                r.payload->>'url',
                r.payload->>'image_url',
                (r.payload->'raw_details'),
                (r.payload->'image_urls'),
                CASE WHEN COALESCE((r.payload->>'is_sold')::boolean, FALSE) THEN 'sold' ELSE 'active' END,
                NOW(),
                NOW()
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                length_m = EXCLUDED.length_m,
                width_m = EXCLUDED.width_m,
                tonnage = EXCLUDED.tonnage,
                build_year = EXCLUDED.build_year,
                price = EXCLUDED.price,
                url = EXCLUDED.url,
                image_url = EXCLUDED.image_url,
                raw_details = EXCLUDED.raw_details,
                image_urls = EXCLUDED.image_urls,
                status = EXCLUDED.status,
                scraped_at = NOW(),
                updated_at = NOW();

            IF r.new_price IS NOT NULL THEN
                INSERT INTO price_history (vessel_id, price, recorded_at)
                SELECT id, r.new_price, NOW()
                FROM vessels
                WHERE source = r.source AND source_id = r.source_id;
            END IF;

            INSERT INTO activity_log (vessel_id, event_type, vessel_name, vessel_source, new_price)
            SELECT id, 'inserted', COALESCE(r.payload->>'name', ''), r.source, r.new_price
            FROM vessels
            WHERE source = r.source AND source_id = r.source_id;

        ELSIF r.event_type = 'price_changed' THEN
            UPDATE vessels
               SET name = COALESCE(r.payload->>'name', name),
                   type = COALESCE(r.payload->>'type', type),
                   length_m = COALESCE(NULLIF(r.payload->>'length_m', '')::numeric, length_m),
                   width_m = COALESCE(NULLIF(r.payload->>'width_m', '')::numeric, width_m),
                   tonnage = COALESCE(NULLIF(r.payload->>'tonnage', '')::numeric, tonnage),
                   build_year = COALESCE(NULLIF(r.payload->>'build_year', '')::int, build_year),
                   price = r.new_price,
                   status = CASE WHEN COALESCE((r.payload->>'is_sold')::boolean, FALSE) THEN 'sold' ELSE 'active' END,
                   url = COALESCE(r.payload->>'url', url),
                   image_url = COALESCE(r.payload->>'image_url', image_url),
                   raw_details = COALESCE((r.payload->'raw_details'), raw_details),
                   image_urls = COALESCE((r.payload->'image_urls'), image_urls),
                   scraped_at = NOW(),
                   updated_at = NOW()
             WHERE id = r.vessel_id;

            IF r.new_price IS NOT NULL THEN
                INSERT INTO price_history (vessel_id, price, recorded_at)
                VALUES (r.vessel_id, r.new_price, NOW());
            END IF;

            INSERT INTO activity_log (vessel_id, event_type, vessel_name, vessel_source, old_price, new_price)
            VALUES (
                r.vessel_id,
                'price_changed',
                COALESCE(r.payload->>'name', ''),
                r.source,
                r.old_price,
                r.new_price
            );

        ELSIF r.event_type = 'sold' THEN
            UPDATE vessels
               SET status = 'sold',
                   scraped_at = NOW(),
                   updated_at = NOW()
             WHERE id = r.vessel_id;

            INSERT INTO activity_log (vessel_id, event_type, vessel_name, vessel_source, old_price, new_price)
            VALUES (
                r.vessel_id,
                'sold',
                COALESCE(r.payload->>'name', ''),
                r.source,
                r.old_price,
                r.new_price
            );

        ELSIF r.event_type = 'removed' THEN
            IF misses >= consecutive_removed_threshold THEN
                UPDATE vessels
                   SET status = 'removed',
                       updated_at = NOW()
                 WHERE id = r.vessel_id;

                INSERT INTO activity_log (vessel_id, event_type, vessel_name, vessel_source, old_price)
                VALUES (
                    r.vessel_id,
                    'removed',
                    COALESCE(r.payload->>'name', ''),
                    r.source,
                    r.old_price
                );
            END IF;

        ELSIF r.event_type = 'unchanged' THEN
            UPDATE vessels
               SET scraped_at = NOW(),
                   updated_at = NOW()
             WHERE id = r.vessel_id;
        END IF;

        event_counts := jsonb_set(
            event_counts,
            ARRAY[r.event_type],
            to_jsonb(COALESCE((event_counts->>r.event_type)::int, 0) + 1),
            true
        );
    END LOOP;

    RETURN jsonb_build_object(
        'run_id', apply_scrape_diff.run_id,
        'source', apply_scrape_diff.source,
        'event_counts', event_counts,
        'removed_threshold', consecutive_removed_threshold,
        'current_miss_candidates', misses
    );
END;
$$;
