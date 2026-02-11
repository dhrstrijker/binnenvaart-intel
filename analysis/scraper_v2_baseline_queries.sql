-- Baseline and parity monitoring queries for scraper pipeline v2.

-- 1) Per-source run metrics summary (last 7 days).
SELECT
  source,
  count(*) AS runs,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY external_request_count) AS p50_external_requests,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY external_request_count) AS p95_external_requests,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY supabase_write_count) AS p50_supabase_writes,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY supabase_write_count) AS p95_supabase_writes,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY run_duration_seconds) AS p50_duration_s,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY run_duration_seconds) AS p95_duration_s
FROM scrape_runs_v2
WHERE started_at >= now() - interval '7 days'
GROUP BY source
ORDER BY source;

-- 2) Event counts by source (last 7 days).
SELECT
  source,
  sum(inserted_count) AS inserted,
  sum(price_changed_count) AS price_changed,
  sum(sold_count) AS sold,
  sum(removed_count) AS removed,
  sum(unchanged_count) AS unchanged
FROM scrape_runs_v2
WHERE started_at >= now() - interval '7 days'
GROUP BY source
ORDER BY source;

-- 3) Shadow parity against legacy scraper_runs by nearest timestamp.
WITH legacy AS (
  SELECT source, created_at, vessel_count,
         row_number() OVER (PARTITION BY source ORDER BY created_at DESC) AS rn
  FROM scraper_runs
  WHERE created_at >= now() - interval '7 days'
),
v2 AS (
  SELECT source, started_at, staged_count,
         row_number() OVER (PARTITION BY source ORDER BY started_at DESC) AS rn
  FROM scrape_runs_v2
  WHERE started_at >= now() - interval '7 days'
)
SELECT
  v2.source,
  v2.started_at AS v2_started_at,
  legacy.created_at AS legacy_created_at,
  v2.staged_count AS v2_count,
  legacy.vessel_count AS legacy_count,
  (v2.staged_count - legacy.vessel_count) AS abs_delta,
  CASE
    WHEN legacy.vessel_count = 0 THEN NULL
    ELSE round((abs(v2.staged_count - legacy.vessel_count)::numeric / legacy.vessel_count::numeric) * 100, 2)
  END AS pct_delta
FROM v2
JOIN legacy USING (source, rn)
ORDER BY v2.started_at DESC;
