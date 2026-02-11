# Scraper V2 Cleanup Plan

This plan focuses on reducing maintenance burden after V2 cutover while preserving rollback safety.

## Principles

- Remove dead paths only after measurable stability.
- Keep behavior changes observable (metrics first, deletion second).
- Prefer consolidation over introducing new abstractions.

## Milestone 1: Freeze and Measure (1-2 days)

1. Lock interfaces
- Freeze `SourceConfig` fields and event semantics in docs/tests.
- Add explicit owner for each adapter file.

2. Baseline health
- Record 7-day baseline from `scrape_runs_v2`:
  - `external_request_count`
  - `supabase_write_count`
  - `parse_fail_count`
  - event counts by kind

3. Exit criteria
- No critical run failures for 3 consecutive scheduled runs.

## Milestone 2: Remove V1 Runtime Coupling (2-3 days)

1. Split entrypoints cleanly
- Keep `main.py` as orchestrator shell.
- Move V1 run path behind explicit legacy function/module.

2. Shrink shared globals
- Remove `_changes` in-memory dependency from modern paths.
- Use DB-backed change reads (`activity_log`, `price_history`) consistently.

3. Exit criteria
- V2 authoritative unaffected in 3 consecutive runs.
- Legacy workflow still manually runnable for rollback period.

## Milestone 3: Adapter Standardization (3-5 days)

1. Standard adapter contract
- Enforce return schema for:
  - `scrape_listing()`
  - `enrich_detail()`
  - metrics keys

2. Retry and HTTP handling
- Centralize retry behavior and status classification in one module.
- Add adapter conformance tests for non-retryable statuses.

3. Exit criteria
- Every source adapter passes the same contract test suite.

## Milestone 4: Database Function Hardening (2-4 days)

1. Consolidate RPC definitions
- Keep only current `p_run_id/p_source` signatures.
- Remove obsolete migration-side duplicates in docs/examples.

2. Add function-level tests
- Fixtures for:
  - idempotent reruns
  - removal gating with healthy/unhealthy runs
  - sold/price transitions

3. Exit criteria
- Diff/apply regression tests pass against a scratch DB.

## Milestone 5: Observability Cleanup (1-2 days)

1. Simplify dashboards/queries
- Keep one canonical parity query set.
- Archive exploratory SQL with clear labels.

2. Add alert routing
- Alert on:
  - source count drop >35%
  - parse fail ratio >10%
  - removal bursts >3x trailing baseline

3. Exit criteria
- Alert thresholds documented and tested in dry run.

## Milestone 6: Legacy Decommission (after rollback window)

1. Remove V1 schedule artifacts (already unscheduled)
- Delete legacy-only run notes and stale docs.

2. Remove V1 write path
- Delete V1 `mark_removed`-driven authoritative behavior.
- Keep a tagged release as historical rollback artifact.

3. Exit criteria
- 7 days stable authoritative V2 operation.
- Stakeholder signoff on decommission checklist.

## Concrete Backlog (Implementation Order)

1. Extract `run_v1_legacy_pipeline()` from `scraper/main.py`.
2. Replace in-memory `_changes` notification dependency with DB query path.
3. Add `tests/test_v2_adapter_contract.py` covering all adapters.
4. Add integration tests for `mark_missing_candidates` and `apply_scrape_diff`.
5. Refactor duplicate source parsing utilities into shared helpers.
6. Remove unused V1-only helper paths after rollback window expires.
