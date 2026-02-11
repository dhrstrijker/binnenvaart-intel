-- Gate missing/removal counters on run health and reset on healthy full-coverage runs.

CREATE OR REPLACE FUNCTION mark_missing_candidates(p_run_id UUID, p_source TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    has_removed BOOLEAN := FALSE;
    run_is_healthy BOOLEAN := FALSE;
    run_staged_count INT := 0;
    run_parse_fail_ratio NUMERIC := 0;
    run_selector_fail_count INT := 0;
    resulting_miss_candidates INT := 0;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM scrape_diff_events_v2 d
        WHERE d.run_id = p_run_id
          AND d.source = p_source
          AND d.event_type = 'removed'
    )
    INTO has_removed;

    SELECT
        COALESCE((r.metadata->>'is_healthy')::boolean, FALSE),
        COALESCE(r.staged_count, 0),
        CASE
            WHEN COALESCE(r.staged_count, 0) > 0
                THEN r.parse_fail_count::numeric / r.staged_count::numeric
            ELSE 0
        END,
        COALESCE(r.selector_fail_count, 0)
    INTO
        run_is_healthy,
        run_staged_count,
        run_parse_fail_ratio,
        run_selector_fail_count
    FROM scrape_runs_v2 r
    WHERE r.id = p_run_id
      AND r.source = p_source;

    INSERT INTO scrape_source_health_v2 (
        source,
        last_vessel_count,
        last_run_status,
        last_run_at,
        last_parse_fail_ratio,
        last_selector_fail_count,
        consecutive_healthy_runs,
        consecutive_unhealthy_runs,
        consecutive_miss_candidates,
        updated_at
    )
    VALUES (
        p_source,
        run_staged_count,
        CASE WHEN run_is_healthy THEN 'healthy' ELSE 'unhealthy' END,
        NOW(),
        run_parse_fail_ratio,
        run_selector_fail_count,
        CASE WHEN run_is_healthy THEN 1 ELSE 0 END,
        CASE WHEN run_is_healthy THEN 0 ELSE 1 END,
        CASE
            WHEN NOT run_is_healthy THEN 0
            WHEN has_removed THEN 1
            ELSE 0
        END,
        NOW()
    )
    ON CONFLICT (source) DO UPDATE SET
        last_vessel_count = EXCLUDED.last_vessel_count,
        last_run_status = EXCLUDED.last_run_status,
        last_run_at = EXCLUDED.last_run_at,
        last_parse_fail_ratio = EXCLUDED.last_parse_fail_ratio,
        last_selector_fail_count = EXCLUDED.last_selector_fail_count,
        consecutive_healthy_runs = CASE
            WHEN run_is_healthy THEN COALESCE(scrape_source_health_v2.consecutive_healthy_runs, 0) + 1
            ELSE 0
        END,
        consecutive_unhealthy_runs = CASE
            WHEN run_is_healthy THEN 0
            ELSE COALESCE(scrape_source_health_v2.consecutive_unhealthy_runs, 0) + 1
        END,
        consecutive_miss_candidates = CASE
            WHEN NOT run_is_healthy THEN COALESCE(scrape_source_health_v2.consecutive_miss_candidates, 0)
            WHEN has_removed THEN COALESCE(scrape_source_health_v2.consecutive_miss_candidates, 0) + 1
            ELSE 0
        END,
        updated_at = NOW();

    SELECT COALESCE(h.consecutive_miss_candidates, 0)
    INTO resulting_miss_candidates
    FROM scrape_source_health_v2 h
    WHERE h.source = p_source;

    RETURN resulting_miss_candidates;
END;
$$;
