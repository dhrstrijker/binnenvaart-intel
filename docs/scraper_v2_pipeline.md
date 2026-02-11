# Scraper V2 Pipeline

This document explains how the V2 ingestion pipeline works in production.

## Goals

- Reduce scrape and write waste through staging + diff-based apply.
- Make run behavior deterministic (`inserted`, `price_changed`, `sold`, `removed`, `unchanged`).
- Keep rollback possible via legacy V1 workflow.

## Execution Model

- Scheduler/orchestrator: GitHub Actions.
- Runtime: `scraper/main.py`.
- V2 entrypoint: `scraper/v2/main_v2.py`.
- Core engine: `scraper/v2/pipeline.py`.

Authoritative production workflow:

- File: `.github/workflows/scrape-v2-authoritative.yml`
- Schedule: `0 7,19 * * *` (07:00 and 19:00 UTC)
- Mode env:
  - `PIPELINE_V2_ENABLED=true`
  - `PIPELINE_V2_ONLY=true`
  - `PIPELINE_V2_MODE=authoritative`
  - `PIPELINE_V2_NOTIFICATIONS=on`
  - `PIPELINE_V2_SOURCES=galle,rensendriessen,pcshipbrokers,gtsschepen,gsk`

Rollback path:

- Legacy workflow remains manual-only at `.github/workflows/scrape.yml`.

## Data Flow

1. **Fetch listings**
- Each adapter fetches listing-level rows for one source.
- Minimal per-run metrics are returned (`external_requests`, parse/selector errors).

2. **Stage listing rows**
- Rows go to `scrape_listing_staging` keyed by `(run_id, source, source_id)`.
- Listing fingerprint is stored for change detection.

3. **Detail-gated enrichment**
- Existing fingerprints are read from `vessels`.
- Detail fetch is skipped unless listing is new/changed (policy-driven).

4. **Stage canonical vessel rows**
- Canonical payloads go to `scrape_vessel_staging`.
- Canonical fingerprint + `is_sold` flags are stored.

5. **Compute diff (DB RPC)**
- `compute_scrape_diff(p_run_id, p_source)` writes `scrape_diff_events_v2`.
- Event types: `inserted`, `price_changed`, `sold`, `removed`, `unchanged`.

6. **Track missing candidates with health gating**
- `mark_missing_candidates(p_run_id, p_source)` updates `scrape_source_health_v2`.
- Miss counters increment only on healthy runs with removed candidates.
- Miss counters reset on healthy runs without removed candidates.
- Unhealthy runs do not increase miss counters.

7. **Apply diff (authoritative mode only)**
- `apply_scrape_diff(p_run_id, p_source)` updates:
  - `vessels`
  - `price_history`
  - `activity_log`
- Removal apply is gated by consecutive misses threshold (default: 2).

8. **Finalize run metrics**
- `scrape_runs_v2` stores operational counters and metadata:
  - request/read/write counts
  - event counts
  - health metadata (`is_healthy`, `health_score`, inputs, thresholds)

## Core Tables

- `scrape_runs_v2`: run-level metrics and metadata.
- `scrape_source_health_v2`: per-source health and miss streaks.
- `scrape_listing_staging`: listing payload + listing fingerprint.
- `scrape_vessel_staging`: canonical payload + canonical fingerprint.
- `scrape_diff_events_v2`: computed events for each run/source row.

## Health Semantics

Run health is computed in `scraper/v2/pipeline.py` from:

- parse fail ratio vs threshold
- selector fail count vs threshold
- page coverage ratio vs threshold

If any threshold fails, run is unhealthy.

## Notification Behavior

- Notifications run from `main.py` unless `PIPELINE_V2_NOTIFICATIONS=off`.
- In production authoritative workflow, this is now `on`.

## Observability and Parity Queries

- Baseline/parity SQL: `analysis/scraper_v2_baseline_queries.sql`.
- Includes:
  - per-source request/write/latency summaries
  - V1 vs V2 count parity
  - guarded removal parity heuristic
  - consecutive parity-pass streak query

## Key Migrations

- `supabase/migrations/20260211_scraper_pipeline_v2.sql`
- `supabase/migrations/20260211_scraper_pipeline_v2_fix_function_param_ambiguity.sql`
- `supabase/migrations/20260211_scraper_pipeline_v2_health_gated_misses.sql`
