-- Ensure detail-worker enrichments are persisted even when diff event is "unchanged".
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
                raw_details = COALESCE(NULLIF(EXCLUDED.raw_details, 'null'::jsonb), vessels.raw_details),
                image_urls = COALESCE(NULLIF(EXCLUDED.image_urls, 'null'::jsonb), vessels.image_urls),
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
                   raw_details = COALESCE(NULLIF((r.payload->'raw_details'), 'null'::jsonb), raw_details),
                   image_urls = COALESCE(NULLIF((r.payload->'image_urls'), 'null'::jsonb), image_urls),
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
               SET name = COALESCE(r.payload->>'name', name),
                   type = COALESCE(r.payload->>'type', type),
                   length_m = COALESCE(NULLIF(r.payload->>'length_m', '')::numeric, length_m),
                   width_m = COALESCE(NULLIF(r.payload->>'width_m', '')::numeric, width_m),
                   tonnage = COALESCE(NULLIF(r.payload->>'tonnage', '')::numeric, tonnage),
                   build_year = COALESCE(NULLIF(r.payload->>'build_year', '')::int, build_year),
                   url = COALESCE(r.payload->>'url', url),
                   image_url = COALESCE(r.payload->>'image_url', image_url),
                   raw_details = COALESCE(NULLIF((r.payload->'raw_details'), 'null'::jsonb), raw_details),
                   image_urls = COALESCE(NULLIF((r.payload->'image_urls'), 'null'::jsonb), image_urls),
                   scraped_at = NOW(),
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
