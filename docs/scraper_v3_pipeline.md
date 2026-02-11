# Scraper V3 Pipeline

This document explains the V3 sidecar pipeline designed for lower notification latency and reduced scrape waste.

## Goals

- Detect new/changed vessels within 15-30 minutes.
- Keep deterministic event semantics (`inserted`, `price_changed`, `sold`, `removed`, `unchanged`).
- Isolate source failures so one adapter does not fail the full run.
- Keep `removed` decisions gated by healthy reconcile runs + consecutive misses.

## Execution Model

- Scheduler/orchestrator: GitHub Actions.
- Runtime entrypoint: `scraper/v3/main_v3.py`.
- Core engine: `scraper/v3/pipeline.py`.
- Queue worker: `detail-worker` run type.
- Alerts: `scraper/v3/alerting.py`.
- Notification dispatch: `scraper/v3/notifications.py` (outbox driven).

## Run Types

1. `detect`
- Fetch listing pages.
- Stage listings and listing-shape vessel payloads.
- Compute diff without `removed` behavior.
- Enqueue detail candidates (`inserted`, `price_changed`, `sold`).
- Apply in authoritative mode only.

2. `detail-worker`
- Claim pending detail jobs from queue.
- Fetch details with retry and non-retryable handling.
- Stage canonical rows for claimed jobs.
- Compute/apply diff without `removed` behavior.
- Mark queue jobs `done`/`pending`/`dead`.

3. `reconcile`
- Full source listing scan with detail gating (`new_or_changed`).
- Compute diff including `removed` candidates.
- Persist run health metadata.
- Update miss counters through `mark_missing_candidates_v3`.
- Apply `removed` only when healthy miss threshold is met.

## Core Tables (V3)

- `scrape_runs_v3`
- `scrape_source_health_v3`
- `scrape_listing_staging_v3`
- `scrape_vessel_staging_v3`
- `scrape_diff_events_v3`
- `scrape_detail_queue_v3`
- `scrape_notifications_outbox_v3`

## Core RPC Functions (V3)

- `compute_scrape_diff_v3(p_run_id, p_source, p_run_type)`
- `enqueue_detail_candidates_v3(p_run_id, p_source)`
- `claim_detail_jobs_v3(p_source, p_limit)`
- `mark_missing_candidates_v3(p_run_id, p_source)`
- `apply_scrape_diff_v3(p_run_id, p_source, p_run_type)`

## Workflow Files

- `.github/workflows/scrape-v3-detect.yml` (`*/15 * * * *`)
- `.github/workflows/scrape-v3-detail-worker.yml` (`*/15 * * * *`)
- `.github/workflows/scrape-v3-reconcile.yml` (`0 */6 * * *`)

All V3 workflows are currently configured in `shadow` mode by default.

## Runtime Flags

- `PIPELINE_V3_MODE=shadow|authoritative`
- `PIPELINE_V3_NOTIFICATIONS=off|on`
- `PIPELINE_V3_SOURCES=galle,rensendriessen,...`
- `PIPELINE_V3_DETAIL_BUDGET_PER_RUN=50`
- `PIPELINE_V3_MAX_QUEUE_AGE_MINUTES=60`
- `PIPELINE_V3_RECONCILE_REMOVE_MISSES=2`
- `PIPELINE_V3_RUN_POST_INGESTION=off|on` (used by reconcile)

## Local Execution

```bash
cd scraper

# Detect run
python v3/main_v3.py --run-type detect --mode shadow --sources galle,rensendriessen

# Detail worker run
python v3/main_v3.py --run-type detail-worker --mode shadow --sources galle

# Reconcile run
python v3/main_v3.py --run-type reconcile --mode shadow --sources galle
```

## Rollout Guidance

1. Keep V3 workflows in `shadow` while monitoring parity and queue behavior.
2. Switch to `authoritative` source-by-source or workflow-by-workflow.
3. Enable V3 notifications only after shadow parity checks are stable.
4. Keep V2 as rollback authority for a 7-day observation window after cutover.
