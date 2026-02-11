# Scraper V2 Cleanup Plan (Implemented)

This document records the cleanup plan execution and resulting architecture.

## Milestone Status

1. Freeze and measure: completed
- `SourceConfig` shape locked with tests.
- Event semantics locked with migration contract test.
- Source ownership mapping added in `v2/config.py`.

2. Remove V1 runtime coupling: completed
- `main.py` now runs V2 ingestion only.
- Notification input switched to DB-backed `get_changes_since(run_start_iso)`.
- In-memory `_changes` runtime dependency removed from `db.py`.

3. Adapter standardization: completed
- Shared adapter contract validators added in `v2/sources/contracts.py`.
- Listing/detail metrics schema standardized.
- Adapter owner constants added and validated.
- Fail-fast non-retryable HTTP behavior covered by contract tests.

4. Database function hardening: completed
- Current RPC signatures (`p_run_id`, `p_source`) are the active interface.
- Integration tests added for:
  - idempotent `compute_scrape_diff`
  - health-gated `mark_missing_candidates`
  - `apply_scrape_diff` sold/price transitions

5. Observability cleanup: completed
- Canonical monitoring queries remain in `analysis/scraper_v2_baseline_queries.sql`.
- Exploratory SQL archive guidance added in `analysis/archive/README.md`.
- V2 threshold alert routing added in `v2/alerting_v2.py` for:
  - source count drop >35%
  - parse fail ratio >10%
  - removal burst >3x trailing median

6. Legacy decommission: completed
- Legacy workflow artifact removed.
- V1 ingestion path removed from `main.py`.
- Production runs are V2-only (authoritative/shadow modes).

## Final Architecture

- Ingestion: `run_pipeline_v2()` only.
- Diff/apply: staging -> RPC diff -> health-gated missing -> apply (authoritative).
- Post-ingestion: dedup, extraction, prediction in `post_ingestion.py`.
- Notifications: DB-backed change query from run start timestamp.
- Alerting: V2 run thresholds via `v2/alerting_v2.py`.

## Remaining Operational Task

- Keep a tagged release as historical rollback artifact if a long-term archive point is required.
