-- Fix claim_detail_jobs_v3 ambiguity on `id` symbol in PL/pgSQL scope.

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
