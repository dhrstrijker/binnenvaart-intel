-- Scraper pipeline v3: dual-cadence detect/detail-worker/reconcile with queue + outbox.

CREATE TABLE IF NOT EXISTS scrape_runs_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    run_type TEXT NOT NULL CHECK (run_type IN ('detect', 'detail-worker', 'reconcile')),
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
    queue_depth INT NOT NULL DEFAULT 0,
    queue_oldest_age_minutes NUMERIC,
    notification_latency_seconds_p95 NUMERIC,
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

CREATE INDEX IF NOT EXISTS idx_scrape_runs_v3_source_started
    ON scrape_runs_v3(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_v3_run_type_status
    ON scrape_runs_v3(run_type, status, started_at DESC);

CREATE TABLE IF NOT EXISTS scrape_source_health_v3 (
    source TEXT PRIMARY KEY,
    trailing_median_count NUMERIC,
    trailing_p95_count NUMERIC,
    last_vessel_count INT,
    last_run_status TEXT,
    last_run_type TEXT,
    last_run_at TIMESTAMPTZ,
    last_parse_fail_ratio NUMERIC,
    last_selector_fail_count INT,
    consecutive_healthy_runs INT NOT NULL DEFAULT 0,
    consecutive_unhealthy_runs INT NOT NULL DEFAULT 0,
    consecutive_miss_candidates INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_listing_staging_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs_v3(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    listing_payload JSONB NOT NULL,
    listing_fingerprint TEXT NOT NULL,
    is_sold BOOLEAN,
    parse_ok BOOLEAN NOT NULL DEFAULT TRUE,
    parse_error TEXT,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_scrape_listing_staging_v3_run_source
    ON scrape_listing_staging_v3(run_id, source);
CREATE INDEX IF NOT EXISTS idx_scrape_listing_staging_v3_lookup
    ON scrape_listing_staging_v3(source, source_id);

CREATE TABLE IF NOT EXISTS scrape_vessel_staging_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs_v3(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_scrape_vessel_staging_v3_run_source
    ON scrape_vessel_staging_v3(run_id, source);
CREATE INDEX IF NOT EXISTS idx_scrape_vessel_staging_v3_lookup
    ON scrape_vessel_staging_v3(source, source_id);

CREATE TABLE IF NOT EXISTS scrape_diff_events_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs_v3(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    run_type TEXT NOT NULL CHECK (run_type IN ('detect', 'detail-worker', 'reconcile')),
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

CREATE INDEX IF NOT EXISTS idx_scrape_diff_events_v3_run_source
    ON scrape_diff_events_v3(run_id, source);
CREATE INDEX IF NOT EXISTS idx_scrape_diff_events_v3_event
    ON scrape_diff_events_v3(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS scrape_detail_queue_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    listing_payload JSONB NOT NULL,
    listing_fingerprint TEXT,
    priority INT NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    claimed_run_id UUID REFERENCES scrape_runs_v3(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_scrape_detail_queue_v3_status
    ON scrape_detail_queue_v3(status, source, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_scrape_detail_queue_v3_created
    ON scrape_detail_queue_v3(created_at DESC);

CREATE TABLE IF NOT EXISTS scrape_notifications_outbox_v3 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES scrape_runs_v3(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    event_id UUID NOT NULL REFERENCES scrape_diff_events_v3(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('inserted', 'price_changed', 'sold', 'removed')),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempt_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_scrape_notifications_outbox_v3_status
    ON scrape_notifications_outbox_v3(status, created_at);

ALTER TABLE scrape_runs_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_source_health_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_listing_staging_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_vessel_staging_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_diff_events_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_detail_queue_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_notifications_outbox_v3 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role all" ON scrape_runs_v3;
CREATE POLICY "Allow service role all" ON scrape_runs_v3
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_source_health_v3;
CREATE POLICY "Allow service role all" ON scrape_source_health_v3
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_listing_staging_v3;
CREATE POLICY "Allow service role all" ON scrape_listing_staging_v3
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_vessel_staging_v3;
CREATE POLICY "Allow service role all" ON scrape_vessel_staging_v3
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_diff_events_v3;
CREATE POLICY "Allow service role all" ON scrape_diff_events_v3
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_detail_queue_v3;
CREATE POLICY "Allow service role all" ON scrape_detail_queue_v3
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role all" ON scrape_notifications_outbox_v3;
CREATE POLICY "Allow service role all" ON scrape_notifications_outbox_v3
    FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION compute_scrape_diff_v3(p_run_id UUID, p_source TEXT, p_run_type TEXT)
RETURNS SETOF scrape_diff_events_v3
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM scrape_diff_events_v3 d
     WHERE d.run_id = p_run_id
       AND d.source = p_source;

    INSERT INTO scrape_diff_events_v3 (
        run_id,
        source,
        source_id,
        run_type,
        vessel_id,
        event_type,
        old_price,
        new_price,
        old_status,
        new_status,
        payload
    )
    SELECT
        s.run_id,
        s.source,
        s.source_id,
        p_run_type,
        v.id,
        CASE
            WHEN v.id IS NULL THEN 'inserted'
            WHEN COALESCE(v.status, 'active') <> 'sold' AND COALESCE(s.is_sold, FALSE) = TRUE THEN 'sold'
            WHEN v.price IS DISTINCT FROM NULLIF((s.vessel_payload->>'price'), '')::numeric THEN 'price_changed'
            ELSE 'unchanged'
        END AS event_type,
        v.price,
        NULLIF((s.vessel_payload->>'price'), '')::numeric,
        v.status,
        CASE WHEN COALESCE(s.is_sold, FALSE) THEN 'sold' ELSE 'active' END,
        s.vessel_payload
    FROM scrape_vessel_staging_v3 s
    LEFT JOIN vessels v
      ON v.source = s.source
     AND v.source_id = s.source_id
    WHERE s.run_id = p_run_id
      AND s.source = p_source;

    IF p_run_type = 'reconcile' THEN
        INSERT INTO scrape_diff_events_v3 (
            run_id,
            source,
            source_id,
            run_type,
            vessel_id,
            event_type,
            old_price,
            new_price,
            old_status,
            new_status,
            payload
        )
        SELECT
            p_run_id,
            p_source,
            v.source_id,
            p_run_type,
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
                'removed_by', 'v3_missing_from_listing_staging'
            )
        FROM vessels v
        WHERE v.source = p_source
          AND v.status = 'active'
          AND NOT EXISTS (
              SELECT 1
              FROM scrape_listing_staging_v3 l
              WHERE l.run_id = p_run_id
                AND l.source = p_source
                AND l.source_id = v.source_id
          )
        ON CONFLICT (run_id, source, source_id) DO NOTHING;
    END IF;

    RETURN QUERY
    SELECT *
      FROM scrape_diff_events_v3 d
     WHERE d.run_id = p_run_id
       AND d.source = p_source
     ORDER BY d.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_detail_candidates_v3(p_run_id UUID, p_source TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    queued_count INT := 0;
BEGIN
    WITH candidates AS (
        SELECT
            d.source,
            d.source_id,
            COALESCE(l.listing_payload, d.payload) AS listing_payload,
            l.listing_fingerprint
        FROM scrape_diff_events_v3 d
        LEFT JOIN scrape_listing_staging_v3 l
          ON l.run_id = d.run_id
         AND l.source = d.source
         AND l.source_id = d.source_id
        WHERE d.run_id = p_run_id
          AND d.source = p_source
          AND d.event_type IN ('inserted', 'price_changed', 'sold')
    )
    INSERT INTO scrape_detail_queue_v3 (
        source,
        source_id,
        listing_payload,
        listing_fingerprint,
        status,
        attempt_count,
        last_error,
        next_attempt_at,
        updated_at
    )
    SELECT
        c.source,
        c.source_id,
        c.listing_payload,
        c.listing_fingerprint,
        'pending',
        0,
        NULL,
        NOW(),
        NOW()
    FROM candidates c
    ON CONFLICT (source, source_id) DO UPDATE
       SET listing_payload = EXCLUDED.listing_payload,
           listing_fingerprint = EXCLUDED.listing_fingerprint,
           status = 'pending',
           attempt_count = CASE
               WHEN scrape_detail_queue_v3.status IN ('done', 'dead') THEN 0
               ELSE scrape_detail_queue_v3.attempt_count
           END,
           last_error = NULL,
           next_attempt_at = NOW(),
           updated_at = NOW();

    GET DIAGNOSTICS queued_count = ROW_COUNT;
    RETURN queued_count;
END;
$$;

CREATE OR REPLACE FUNCTION claim_detail_jobs_v3(p_source TEXT, p_limit INT)
RETURNS TABLE (
    id UUID,
    source TEXT,
    source_id TEXT,
    listing_payload JSONB,
    attempt_count INT,
    max_attempts INT,
    listing_fingerprint TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH picked AS (
        SELECT q.id AS picked_id
        FROM scrape_detail_queue_v3 q
        WHERE q.status = 'pending'
          AND q.next_attempt_at <= NOW()
          AND (p_source IS NULL OR q.source = p_source)
        ORDER BY q.priority ASC, q.created_at ASC
        LIMIT GREATEST(1, p_limit)
        FOR UPDATE SKIP LOCKED
    ), claimed AS (
        UPDATE scrape_detail_queue_v3 q
           SET status = 'processing',
               locked_at = NOW(),
               locked_by = CONCAT('db-', pg_backend_pid()::text),
               updated_at = NOW()
         WHERE q.id IN (SELECT p.picked_id FROM picked p)
         RETURNING q.id, q.source, q.source_id, q.listing_payload, q.attempt_count, q.max_attempts, q.listing_fingerprint
    )
    SELECT * FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION mark_missing_candidates_v3(p_run_id UUID, p_source TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    run_is_healthy BOOLEAN := FALSE;
    has_removed BOOLEAN := FALSE;
    current_misses INT := 0;
BEGIN
    SELECT COALESCE((r.metadata->>'is_healthy')::boolean, FALSE)
      INTO run_is_healthy
      FROM scrape_runs_v3 r
     WHERE r.id = p_run_id;

    SELECT EXISTS (
        SELECT 1
        FROM scrape_diff_events_v3 d
        WHERE d.run_id = p_run_id
          AND d.source = p_source
          AND d.event_type = 'removed'
    ) INTO has_removed;

    INSERT INTO scrape_source_health_v3 (source, consecutive_miss_candidates, updated_at)
    VALUES (p_source, 0, NOW())
    ON CONFLICT (source) DO NOTHING;

    IF run_is_healthy THEN
        IF has_removed THEN
            UPDATE scrape_source_health_v3
               SET consecutive_miss_candidates = COALESCE(consecutive_miss_candidates, 0) + 1,
                   consecutive_healthy_runs = COALESCE(consecutive_healthy_runs, 0) + 1,
                   consecutive_unhealthy_runs = 0,
                   updated_at = NOW()
             WHERE source = p_source;
        ELSE
            UPDATE scrape_source_health_v3
               SET consecutive_miss_candidates = 0,
                   consecutive_healthy_runs = COALESCE(consecutive_healthy_runs, 0) + 1,
                   consecutive_unhealthy_runs = 0,
                   updated_at = NOW()
             WHERE source = p_source;
        END IF;
    ELSE
        UPDATE scrape_source_health_v3
           SET consecutive_unhealthy_runs = COALESCE(consecutive_unhealthy_runs, 0) + 1,
               consecutive_healthy_runs = 0,
               updated_at = NOW()
         WHERE source = p_source;
    END IF;

    SELECT COALESCE(consecutive_miss_candidates, 0)
      INTO current_misses
      FROM scrape_source_health_v3
     WHERE source = p_source;

    RETURN current_misses;
END;
$$;

CREATE OR REPLACE FUNCTION apply_scrape_diff_v3(p_run_id UUID, p_source TEXT, p_run_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    event_counts JSONB := '{}'::jsonb;
    remove_threshold INT := 2;
    misses INT := 0;
    run_metadata JSONB := '{}'::jsonb;
    apply_result JSONB := '{}'::jsonb;
BEGIN
    SELECT COALESCE(metadata, '{}'::jsonb)
      INTO run_metadata
      FROM scrape_runs_v3
     WHERE id = p_run_id;

    IF COALESCE((run_metadata->>'apply_completed')::boolean, FALSE) THEN
        RETURN jsonb_build_object(
            'run_id', p_run_id,
            'source', p_source,
            'run_type', p_run_type,
            'event_counts', COALESCE(run_metadata->'last_apply_result'->'event_counts', '{}'::jsonb),
            'removed_threshold', COALESCE((run_metadata->'last_apply_result'->>'removed_threshold')::int, 2),
            'current_miss_candidates', COALESCE((run_metadata->'last_apply_result'->>'current_miss_candidates')::int, 0),
            'skipped', true,
            'reason', 'already_applied'
        );
    END IF;

    SELECT COALESCE((metadata->>'remove_miss_threshold')::int, 2)
      INTO remove_threshold
      FROM scrape_runs_v3
     WHERE id = p_run_id;

    SELECT COALESCE(consecutive_miss_candidates, 0)
      INTO misses
      FROM scrape_source_health_v3
     WHERE source = p_source;

    FOR r IN
        SELECT *
        FROM scrape_diff_events_v3 d
        WHERE d.run_id = p_run_id
          AND d.source = p_source
        ORDER BY d.created_at ASC
    LOOP
        IF r.event_type = 'inserted' THEN
            INSERT INTO vessels (
                source,
                source_id,
                name,
                type,
                length_m,
                width_m,
                tonnage,
                build_year,
                price,
                url,
                image_url,
                raw_details,
                image_urls,
                status,
                scraped_at,
                updated_at
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

            INSERT INTO scrape_notifications_outbox_v3 (run_id, source, event_id, event_type, payload)
            VALUES (
                p_run_id,
                p_source,
                r.id,
                'inserted',
                r.payload || jsonb_build_object('_source_id', r.source_id, '_old_price', r.old_price, '_new_price', r.new_price)
            )
            ON CONFLICT (event_id) DO NOTHING;

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

            INSERT INTO scrape_notifications_outbox_v3 (run_id, source, event_id, event_type, payload)
            VALUES (
                p_run_id,
                p_source,
                r.id,
                'price_changed',
                r.payload || jsonb_build_object('_source_id', r.source_id, '_old_price', r.old_price, '_new_price', r.new_price)
            )
            ON CONFLICT (event_id) DO NOTHING;

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

            INSERT INTO scrape_notifications_outbox_v3 (run_id, source, event_id, event_type, payload)
            VALUES (
                p_run_id,
                p_source,
                r.id,
                'sold',
                r.payload || jsonb_build_object('_source_id', r.source_id, '_old_price', r.old_price, '_new_price', r.new_price)
            )
            ON CONFLICT (event_id) DO NOTHING;

        ELSIF r.event_type = 'removed' THEN
            IF p_run_type = 'reconcile' AND misses >= remove_threshold THEN
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

                INSERT INTO scrape_notifications_outbox_v3 (run_id, source, event_id, event_type, payload)
                VALUES (
                    p_run_id,
                    p_source,
                    r.id,
                    'removed',
                    r.payload || jsonb_build_object('_source_id', r.source_id, '_old_price', r.old_price, '_new_price', r.new_price)
                )
                ON CONFLICT (event_id) DO NOTHING;
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

    apply_result := jsonb_build_object(
        'run_id', p_run_id,
        'source', p_source,
        'run_type', p_run_type,
        'event_counts', event_counts,
        'removed_threshold', remove_threshold,
        'current_miss_candidates', misses
    );

    UPDATE scrape_runs_v3
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'apply_completed', true,
           'last_apply_result', apply_result,
           'last_applied_at', NOW()
       )
     WHERE id = p_run_id;

    RETURN apply_result;
END;
$$;
