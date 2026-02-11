-- Fix PL/pgSQL parameter/column ambiguity in v2 RPC functions.

CREATE OR REPLACE FUNCTION compute_scrape_diff(p_run_id UUID, p_source TEXT)
RETURNS SETOF scrape_diff_events_v2
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM scrape_diff_events_v2 d
     WHERE d.run_id = p_run_id
       AND d.source = p_source;

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
    WHERE s.run_id = p_run_id
      AND s.source = p_source;

    INSERT INTO scrape_diff_events_v2 (
        run_id, source, source_id, vessel_id, event_type,
        old_price, new_price, old_status, new_status, payload
    )
    SELECT
        p_run_id,
        p_source,
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
    WHERE v.source = p_source
      AND v.status = 'active'
      AND NOT EXISTS (
          SELECT 1
          FROM scrape_vessel_staging s
          WHERE s.run_id = p_run_id
            AND s.source = p_source
            AND s.source_id = v.source_id
      )
    ON CONFLICT (run_id, source, source_id) DO NOTHING;

    RETURN QUERY
    SELECT *
      FROM scrape_diff_events_v2 d
     WHERE d.run_id = p_run_id
       AND d.source = p_source
     ORDER BY d.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION mark_missing_candidates(p_run_id UUID, p_source TEXT)
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
     WHERE h.source = p_source
       AND EXISTS (
           SELECT 1
           FROM scrape_diff_events_v2 d
           WHERE d.run_id = p_run_id
             AND d.source = p_source
             AND d.event_type = 'removed'
       );

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    INSERT INTO scrape_source_health_v2 (source, consecutive_miss_candidates, updated_at)
    SELECT p_source, 1, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM scrape_source_health_v2 h WHERE h.source = p_source)
      AND EXISTS (
           SELECT 1
           FROM scrape_diff_events_v2 d
           WHERE d.run_id = p_run_id
             AND d.source = p_source
             AND d.event_type = 'removed'
      );

    RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION apply_scrape_diff(p_run_id UUID, p_source TEXT)
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
     WHERE scrape_source_health_v2.source = p_source;

    FOR r IN
        SELECT *
        FROM scrape_diff_events_v2 d
        WHERE d.run_id = p_run_id
          AND d.source = p_source
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
        'run_id', p_run_id,
        'source', p_source,
        'event_counts', event_counts,
        'removed_threshold', consecutive_removed_threshold,
        'current_miss_candidates', misses
    );
END;
$$;
