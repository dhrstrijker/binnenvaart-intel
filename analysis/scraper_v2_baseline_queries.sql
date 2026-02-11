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

-- 4) Guarded removed parity: ignore single-run short-window churn.
WITH v1 AS (
  SELECT
    source,
    created_at,
    vessel_count,
    removed_count,
    row_number() OVER (PARTITION BY source ORDER BY created_at DESC) AS rn
  FROM scraper_runs
  WHERE created_at >= now() - interval '7 days'
),
v2 AS (
  SELECT
    source,
    started_at,
    staged_count,
    removed_count,
    COALESCE((metadata->>'is_healthy')::boolean, false) AS is_healthy,
    row_number() OVER (PARTITION BY source ORDER BY started_at DESC) AS rn
  FROM scrape_runs_v2
  WHERE started_at >= now() - interval '7 days'
),
paired AS (
  SELECT
    v2.source,
    v2.started_at,
    v2.is_healthy,
    v2.staged_count,
    v1.vessel_count,
    v2.removed_count AS v2_removed,
    v1.removed_count AS v1_removed,
    (v2.removed_count - v1.removed_count) AS removed_delta,
    CASE
      WHEN v1.vessel_count = 0 THEN NULL
      ELSE (abs(v2.staged_count - v1.vessel_count)::numeric / v1.vessel_count::numeric)
    END AS vessel_delta_ratio
  FROM v2
  JOIN v1 USING (source, rn)
),
guarded AS (
  SELECT
    p.*,
    (
      abs(p.removed_delta) > 0
      AND p.is_healthy
      AND COALESCE(lag(p.is_healthy) OVER (PARTITION BY p.source ORDER BY p.started_at), false)
      AND COALESCE(abs(lag(p.removed_delta) OVER (PARTITION BY p.source ORDER BY p.started_at)) > 0, false)
    ) AS removed_parity_breach_guarded
  FROM paired p
)
SELECT
  source,
  started_at,
  is_healthy,
  staged_count AS v2_count,
  vessel_count AS v1_count,
  v2_removed,
  v1_removed,
  removed_delta,
  removed_parity_breach_guarded,
  round(vessel_delta_ratio * 100, 2) AS vessel_pct_delta
FROM guarded
ORDER BY started_at DESC;

-- 5) Consecutive parity-pass streak per source (target >= 3).
WITH v1 AS (
  SELECT
    source,
    created_at,
    vessel_count,
    removed_count,
    row_number() OVER (PARTITION BY source ORDER BY created_at DESC) AS rn
  FROM scraper_runs
  WHERE created_at >= now() - interval '7 days'
),
v2 AS (
  SELECT
    source,
    started_at,
    staged_count,
    removed_count,
    COALESCE((metadata->>'is_healthy')::boolean, false) AS is_healthy,
    row_number() OVER (PARTITION BY source ORDER BY started_at DESC) AS rn
  FROM scrape_runs_v2
  WHERE started_at >= now() - interval '7 days'
),
paired AS (
  SELECT
    v2.source,
    v2.started_at,
    v2.is_healthy,
    v2.staged_count,
    v1.vessel_count,
    (v2.removed_count - v1.removed_count) AS removed_delta,
    CASE
      WHEN v1.vessel_count = 0 THEN NULL
      ELSE (abs(v2.staged_count - v1.vessel_count)::numeric / v1.vessel_count::numeric)
    END AS vessel_delta_ratio
  FROM v2
  JOIN v1 USING (source, rn)
),
passes AS (
  SELECT
    p.*,
    (
      abs(p.removed_delta) > 0
      AND p.is_healthy
      AND COALESCE(lag(p.is_healthy) OVER (PARTITION BY p.source ORDER BY p.started_at), false)
      AND COALESCE(abs(lag(p.removed_delta) OVER (PARTITION BY p.source ORDER BY p.started_at)) > 0, false)
    ) AS removed_parity_breach_guarded,
    (
      p.is_healthy
      AND (p.vessel_delta_ratio IS NULL OR p.vessel_delta_ratio <= 0.02)
    ) AS base_pass
  FROM paired p
),
scored AS (
  SELECT
    source,
    started_at,
    (base_pass AND NOT removed_parity_breach_guarded) AS parity_pass,
    row_number() OVER (PARTITION BY source ORDER BY started_at DESC) AS recency_rank
  FROM passes
),
latest_fails AS (
  SELECT
    source,
    MIN(recency_rank) FILTER (WHERE parity_pass = false) AS first_fail_rank
  FROM scored
  GROUP BY source
)
SELECT
  s.source,
  COALESCE(
    CASE
      WHEN lf.first_fail_rank IS NULL THEN COUNT(*)
      ELSE lf.first_fail_rank - 1
    END,
    0
  ) AS consecutive_parity_passes
FROM scored s
JOIN latest_fails lf ON lf.source = s.source
GROUP BY s.source, lf.first_fail_rank
ORDER BY s.source;
