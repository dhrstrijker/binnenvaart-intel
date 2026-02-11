from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import requests

from db import supabase
from http_utils import is_non_retryable_http_error
from v3.config import SourceConfigV3
from v3.db import queue_depth_and_oldest_age_minutes, update_run_v3
from v3.fingerprint import make_fingerprint
from v3.metrics import RunMetricsV3
from v3.queue import DetailQueueV3
from v3.sources.contracts import (
    validate_detail_metrics_v3,
    validate_detail_row_v3,
    validate_listing_metrics_v3,
    validate_listing_rows_v3,
)

logger = logging.getLogger(__name__)


class PipelineV3:
    def __init__(
        self,
        mode: str = "shadow",
        detail_budget_per_run: int = 50,
        max_queue_age_minutes: int = 60,
        remove_miss_threshold: int = 2,
    ):
        self.mode = mode
        self.detail_budget_per_run = max(1, int(detail_budget_per_run))
        self.max_queue_age_minutes = max_queue_age_minutes
        self.remove_miss_threshold = max(1, int(remove_miss_threshold))

    def start_run(self, source: str, run_type: str, metadata: dict | None = None) -> str:
        row = (
            supabase.table("scrape_runs_v3")
            .insert(
                {
                    "source": source,
                    "run_type": run_type,
                    "mode": self.mode,
                    "status": "running",
                    "metadata": metadata or {},
                }
            )
            .execute()
        )
        return row.data[0]["id"]

    @staticmethod
    def _listing_shape(payload: dict) -> dict:
        return {
            "source": payload.get("source"),
            "source_id": str(payload.get("source_id")),
            "name": payload.get("name"),
            "type": payload.get("type"),
            "length_m": payload.get("length_m"),
            "width_m": payload.get("width_m"),
            "tonnage": payload.get("tonnage"),
            "build_year": payload.get("build_year"),
            "price": payload.get("price"),
            "url": payload.get("url"),
            "image_url": payload.get("image_url"),
            "is_sold": bool(payload.get("is_sold", False)),
        }

    def _read_existing_fingerprints(self, source: str) -> dict[str, str]:
        result = (
            supabase.table("vessels")
            .select(
                "source_id,raw_details,name,type,length_m,width_m,tonnage,build_year,price,url,image_url,image_urls,status"
            )
            .eq("source", source)
            .execute()
        )
        rows = result.data or []
        by_id: dict[str, str] = {}
        for row in rows:
            source_id = row.get("source_id")
            if not source_id:
                continue
            listing_payload = self._listing_shape(
                {
                    "source": source,
                    "source_id": str(source_id),
                    "name": row.get("name"),
                    "type": row.get("type"),
                    "length_m": row.get("length_m"),
                    "width_m": row.get("width_m"),
                    "tonnage": row.get("tonnage"),
                    "build_year": row.get("build_year"),
                    "price": row.get("price"),
                    "url": row.get("url"),
                    "image_url": row.get("image_url"),
                    "is_sold": row.get("status") == "sold",
                }
            )
            by_id[str(source_id)] = make_fingerprint(listing_payload)
        return by_id

    def _insert_listing_staging(self, run_id: str, source: str, listings: list[dict]) -> None:
        if not listings:
            return

        rows = []
        for listing in listings:
            shaped = self._listing_shape(listing)
            rows.append(
                {
                    "run_id": run_id,
                    "source": source,
                    "source_id": str(shaped["source_id"]),
                    "listing_payload": listing,
                    "listing_fingerprint": make_fingerprint(shaped),
                    "is_sold": shaped["is_sold"],
                }
            )

        supabase.table("scrape_listing_staging_v3").upsert(rows, on_conflict="run_id,source,source_id").execute()

    def _insert_vessel_staging(self, run_id: str, source: str, vessels: list[dict]) -> None:
        if not vessels:
            return

        rows = []
        for vessel in vessels:
            payload = dict(vessel)
            rows.append(
                {
                    "run_id": run_id,
                    "source": source,
                    "source_id": str(payload["source_id"]),
                    "vessel_payload": payload,
                    "canonical_fingerprint": make_fingerprint(payload),
                    "is_sold": bool(payload.get("is_sold", False)),
                    "parse_ok": True,
                }
            )

        supabase.table("scrape_vessel_staging_v3").upsert(rows, on_conflict="run_id,source,source_id").execute()

    @staticmethod
    def _build_health_summary(
        thresholds: dict[str, float],
        parse_fail_ratio: float,
        selector_fail_count: int,
        page_coverage_ratio: float,
    ) -> dict:
        max_parse_fail_ratio = float(thresholds.get("max_parse_fail_ratio", 0.10))
        max_selector_fail_count = int(thresholds.get("max_selector_fail_count", 3))
        min_page_coverage_ratio = float(thresholds.get("min_page_coverage_ratio", 0.65))

        parse_ok = parse_fail_ratio <= max_parse_fail_ratio
        selector_ok = selector_fail_count <= max_selector_fail_count
        coverage_ok = page_coverage_ratio >= min_page_coverage_ratio
        is_healthy = parse_ok and selector_ok and coverage_ok

        parse_component = max(0.0, 1.0 - (parse_fail_ratio / max_parse_fail_ratio)) if max_parse_fail_ratio > 0 else 1.0
        selector_component = (
            max(0.0, 1.0 - (selector_fail_count / max_selector_fail_count)) if max_selector_fail_count > 0 else 1.0
        )
        coverage_component = (
            min(1.0, page_coverage_ratio / min_page_coverage_ratio) if min_page_coverage_ratio > 0 else 1.0
        )
        health_score = round((parse_component + selector_component + coverage_component) / 3.0, 3)

        return {
            "is_healthy": is_healthy,
            "health_score": health_score,
            "checks": {
                "parse_ok": parse_ok,
                "selector_ok": selector_ok,
                "coverage_ok": coverage_ok,
            },
        }

    @staticmethod
    def _count_diff_events(diff_rows: list[dict], metrics: RunMetricsV3) -> None:
        for row in diff_rows:
            event_type = row.get("event_type")
            if event_type == "inserted":
                metrics.inserted_count += 1
            elif event_type == "price_changed":
                metrics.price_changed_count += 1
            elif event_type == "sold":
                metrics.sold_count += 1
            elif event_type == "removed":
                metrics.removed_count += 1
            elif event_type == "unchanged":
                metrics.unchanged_count += 1

    def _finalize_success(
        self,
        run_id: str,
        started: float,
        metrics: RunMetricsV3,
        metadata: dict,
    ) -> None:
        duration = time.monotonic() - started
        queue_depth, queue_oldest_age = queue_depth_and_oldest_age_minutes(metadata["source"])
        metrics.queue_depth = queue_depth
        metrics.queue_oldest_age_minutes = queue_oldest_age
        metrics.supabase_write_count += 1
        update = metrics.to_db_update()
        update.update(
            {
                "status": "success",
                "run_duration_seconds": round(duration, 3),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata,
            }
        )
        update_run_v3(run_id, update)

    def _finalize_error(
        self,
        run_id: str,
        started: float,
        metrics: RunMetricsV3,
        metadata: dict,
        error_message: str,
    ) -> None:
        duration = time.monotonic() - started
        queue_depth, queue_oldest_age = queue_depth_and_oldest_age_minutes(metadata["source"])
        metrics.queue_depth = queue_depth
        metrics.queue_oldest_age_minutes = queue_oldest_age
        metrics.supabase_write_count += 1
        update = metrics.to_db_update()
        update.update(
            {
                "status": "error",
                "run_duration_seconds": round(duration, 3),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata,
                "error_message": error_message[:1000],
            }
        )
        update_run_v3(run_id, update)

    def run_detect_source(self, adapter, source_config: SourceConfigV3) -> dict:
        started = time.monotonic()
        metrics = RunMetricsV3()
        run_metadata = {
            "adapter": adapter.__class__.__name__,
            "source": source_config.source_key,
            "run_type": "detect",
            "remove_miss_threshold": source_config.max_consecutive_misses_for_removed,
        }
        run_id = self.start_run(source_config.source_key, "detect", metadata=run_metadata)

        try:
            raw_listings, raw_adapter_metrics = adapter.scrape_listing()
            listings = validate_listing_rows_v3(source_config.source_key, raw_listings)
            adapter_metrics = validate_listing_metrics_v3(source_config.source_key, raw_adapter_metrics)

            metrics.external_request_count += adapter_metrics["external_requests"]
            metrics.parse_fail_count += adapter_metrics["parse_fail_count"]
            metrics.selector_fail_count += adapter_metrics["selector_fail_count"]
            metrics.staged_count = len(listings)
            page_coverage_ratio = adapter_metrics["page_coverage_ratio"]

            self._insert_listing_staging(run_id, source_config.source_key, listings)
            metrics.supabase_write_count += 1

            vessels = [dict(row) for row in listings]
            self._insert_vessel_staging(run_id, source_config.source_key, vessels)
            metrics.supabase_write_count += 1

            diff_rows = supabase.rpc(
                "compute_scrape_diff_v3",
                {
                    "p_run_id": run_id,
                    "p_source": source_config.source_key,
                    "p_run_type": "detect",
                },
            ).execute()
            metrics.supabase_write_count += 1

            queued = supabase.rpc(
                "enqueue_detail_candidates_v3",
                {
                    "p_run_id": run_id,
                    "p_source": source_config.source_key,
                },
            ).execute()
            metrics.supabase_write_count += 1

            parse_fail_ratio = 0.0
            if metrics.staged_count > 0:
                parse_fail_ratio = metrics.parse_fail_count / metrics.staged_count

            health_summary = self._build_health_summary(
                thresholds=source_config.health_thresholds,
                parse_fail_ratio=parse_fail_ratio,
                selector_fail_count=metrics.selector_fail_count,
                page_coverage_ratio=page_coverage_ratio,
            )
            run_metadata.update(
                {
                    "is_healthy": health_summary["is_healthy"],
                    "health_score": health_summary["health_score"],
                    "health_inputs": {
                        "parse_fail_ratio": parse_fail_ratio,
                        "selector_fail_count": metrics.selector_fail_count,
                        "page_coverage_ratio": page_coverage_ratio,
                    },
                    "health_thresholds": source_config.health_thresholds,
                    "detail_queued_count": int(queued.data or 0),
                }
            )

            apply_result = None
            if self.mode == "authoritative":
                apply_result = (
                    supabase.rpc(
                        "apply_scrape_diff_v3",
                        {
                            "p_run_id": run_id,
                            "p_source": source_config.source_key,
                            "p_run_type": "detect",
                        },
                    )
                    .execute()
                    .data
                )
                metrics.supabase_write_count += 1
                run_metadata["apply_result"] = apply_result

            self._count_diff_events(diff_rows.data or [], metrics)
            self._finalize_success(run_id, started, metrics, run_metadata)

            return {
                "run_id": run_id,
                "source": source_config.source_key,
                "run_type": "detect",
                "mode": self.mode,
                "status": "success",
                "listings": len(listings),
                "staged_count": metrics.staged_count,
                "parse_fail_count": metrics.parse_fail_count,
                "inserted": metrics.inserted_count,
                "price_changed": metrics.price_changed_count,
                "sold": metrics.sold_count,
                "removed": metrics.removed_count,
                "unchanged": metrics.unchanged_count,
                "detail_fetch_count": metrics.detail_fetch_count,
                "queue_depth": metrics.queue_depth,
                "queue_oldest_age_minutes": metrics.queue_oldest_age_minutes,
                "notification_latency_seconds_p95": metrics.notification_latency_seconds_p95,
                "apply_result": apply_result,
            }
        except Exception as exc:
            logger.exception("V3 detect failed for %s", source_config.source_key)
            self._finalize_error(run_id, started, metrics, run_metadata, str(exc))
            return {
                "run_id": run_id,
                "source": source_config.source_key,
                "run_type": "detect",
                "mode": self.mode,
                "status": "error",
                "error": str(exc),
                "queue_depth": metrics.queue_depth,
                "queue_oldest_age_minutes": metrics.queue_oldest_age_minutes,
                "notification_latency_seconds_p95": None,
            }

    def run_detail_worker_source(self, adapter, source_config: SourceConfigV3) -> dict:
        started = time.monotonic()
        metrics = RunMetricsV3()
        run_metadata = {
            "adapter": adapter.__class__.__name__,
            "source": source_config.source_key,
            "run_type": "detail-worker",
            "remove_miss_threshold": source_config.max_consecutive_misses_for_removed,
        }
        run_id = self.start_run(source_config.source_key, "detail-worker", metadata=run_metadata)
        claimed_jobs: list[dict] = []
        successful_jobs: list[dict] = []

        try:
            batch_size = min(source_config.detail_worker_batch_size, self.detail_budget_per_run)
            claimed_jobs = DetailQueueV3.claim_jobs(source_config.source_key, batch_size)
            metrics.supabase_write_count += 1

            if not claimed_jobs:
                self._finalize_success(run_id, started, metrics, run_metadata)
                return {
                    "run_id": run_id,
                    "source": source_config.source_key,
                    "run_type": "detail-worker",
                    "mode": self.mode,
                    "status": "success",
                    "listings": 0,
                    "staged_count": 0,
                    "parse_fail_count": 0,
                    "inserted": 0,
                    "price_changed": 0,
                    "sold": 0,
                    "removed": 0,
                    "unchanged": 0,
                    "detail_fetch_count": 0,
                    "queue_depth": metrics.queue_depth,
                    "queue_oldest_age_minutes": metrics.queue_oldest_age_minutes,
                    "notification_latency_seconds_p95": None,
                    "apply_result": None,
                }

            vessels = []
            for job in claimed_jobs:
                listing_payload = dict(job.get("listing_payload") or {})
                listing_payload.setdefault("source", source_config.source_key)
                listing_payload.setdefault("source_id", job.get("source_id"))

                try:
                    raw_vessel, raw_detail_metrics = adapter.enrich_detail(listing_payload)
                    vessel = validate_detail_row_v3(source_config.source_key, raw_vessel)
                    detail_metrics = validate_detail_metrics_v3(source_config.source_key, raw_detail_metrics)
                    metrics.external_request_count += detail_metrics["external_requests"]
                    metrics.parse_fail_count += detail_metrics["parse_fail_count"]
                    metrics.detail_fetch_count += 1
                    successful_jobs.append(job)
                    vessels.append(vessel)
                except requests.RequestException as exc:
                    if is_non_retryable_http_error(exc):
                        DetailQueueV3.mark_dead(job["id"], str(exc))
                    else:
                        DetailQueueV3.mark_retry(job, str(exc))
                    metrics.supabase_write_count += 1
                except Exception as exc:
                    logger.exception("Detail-worker failed to enrich %s/%s", source_config.source_key, job.get("source_id"))
                    DetailQueueV3.mark_retry(job, str(exc))
                    metrics.supabase_write_count += 1

            metrics.staged_count = len(vessels)
            if vessels:
                self._insert_vessel_staging(run_id, source_config.source_key, vessels)
                metrics.supabase_write_count += 1

                diff_rows = supabase.rpc(
                    "compute_scrape_diff_v3",
                    {
                        "p_run_id": run_id,
                        "p_source": source_config.source_key,
                        "p_run_type": "detail-worker",
                    },
                ).execute()
                metrics.supabase_write_count += 1

                apply_result = None
                if self.mode == "authoritative":
                    apply_result = (
                        supabase.rpc(
                            "apply_scrape_diff_v3",
                            {
                                "p_run_id": run_id,
                                "p_source": source_config.source_key,
                                "p_run_type": "detail-worker",
                            },
                        )
                        .execute()
                        .data
                    )
                    metrics.supabase_write_count += 1
                run_metadata["apply_result"] = apply_result
                self._count_diff_events(diff_rows.data or [], metrics)
            else:
                apply_result = None

            for job in successful_jobs:
                DetailQueueV3.mark_done(job["id"])
                metrics.supabase_write_count += 1

            self._finalize_success(run_id, started, metrics, run_metadata)
            return {
                "run_id": run_id,
                "source": source_config.source_key,
                "run_type": "detail-worker",
                "mode": self.mode,
                "status": "success",
                "listings": len(claimed_jobs),
                "staged_count": metrics.staged_count,
                "parse_fail_count": metrics.parse_fail_count,
                "inserted": metrics.inserted_count,
                "price_changed": metrics.price_changed_count,
                "sold": metrics.sold_count,
                "removed": metrics.removed_count,
                "unchanged": metrics.unchanged_count,
                "detail_fetch_count": metrics.detail_fetch_count,
                "queue_depth": metrics.queue_depth,
                "queue_oldest_age_minutes": metrics.queue_oldest_age_minutes,
                "notification_latency_seconds_p95": metrics.notification_latency_seconds_p95,
                "apply_result": run_metadata.get("apply_result"),
            }
        except Exception as exc:
            logger.exception("V3 detail-worker failed for %s", source_config.source_key)
            for job in successful_jobs:
                DetailQueueV3.mark_retry(job, f"run_failed:{exc}")
                metrics.supabase_write_count += 1
            self._finalize_error(run_id, started, metrics, run_metadata, str(exc))
            return {
                "run_id": run_id,
                "source": source_config.source_key,
                "run_type": "detail-worker",
                "mode": self.mode,
                "status": "error",
                "error": str(exc),
                "queue_depth": metrics.queue_depth,
                "queue_oldest_age_minutes": metrics.queue_oldest_age_minutes,
                "notification_latency_seconds_p95": None,
            }

    def run_reconcile_source(self, adapter, source_config: SourceConfigV3) -> dict:
        started = time.monotonic()
        metrics = RunMetricsV3()
        run_metadata = {
            "adapter": adapter.__class__.__name__,
            "source": source_config.source_key,
            "run_type": "reconcile",
            "remove_miss_threshold": source_config.max_consecutive_misses_for_removed,
        }
        run_id = self.start_run(source_config.source_key, "reconcile", metadata=run_metadata)

        try:
            raw_listings, raw_adapter_metrics = adapter.scrape_listing()
            listings = validate_listing_rows_v3(source_config.source_key, raw_listings)
            adapter_metrics = validate_listing_metrics_v3(source_config.source_key, raw_adapter_metrics)
            metrics.external_request_count += adapter_metrics["external_requests"]
            metrics.parse_fail_count += adapter_metrics["parse_fail_count"]
            metrics.selector_fail_count += adapter_metrics["selector_fail_count"]
            metrics.staged_count = len(listings)
            page_coverage_ratio = adapter_metrics["page_coverage_ratio"]

            self._insert_listing_staging(run_id, source_config.source_key, listings)
            metrics.supabase_write_count += 1

            existing_fps = self._read_existing_fingerprints(source_config.source_key)
            metrics.supabase_read_count += 1

            vessels = []
            for listing in listings:
                source_id = str(listing["source_id"])
                listing_fp = make_fingerprint(self._listing_shape(listing))
                should_fetch_detail = source_config.detail_fetch_policy == "always" or (
                    source_config.detail_fetch_policy == "new_or_changed" and existing_fps.get(source_id) != listing_fp
                )

                if should_fetch_detail:
                    raw_vessel, raw_detail_metrics = adapter.enrich_detail(listing)
                    vessel = validate_detail_row_v3(source_config.source_key, raw_vessel)
                    detail_metrics = validate_detail_metrics_v3(source_config.source_key, raw_detail_metrics)
                    metrics.external_request_count += detail_metrics["external_requests"]
                    metrics.parse_fail_count += detail_metrics["parse_fail_count"]
                    metrics.detail_fetch_count += 1
                else:
                    vessel = dict(listing)

                vessels.append(vessel)

            self._insert_vessel_staging(run_id, source_config.source_key, vessels)
            metrics.supabase_write_count += 1

            diff_rows = supabase.rpc(
                "compute_scrape_diff_v3",
                {
                    "p_run_id": run_id,
                    "p_source": source_config.source_key,
                    "p_run_type": "reconcile",
                },
            ).execute()
            metrics.supabase_write_count += 1

            parse_fail_ratio = 0.0
            if metrics.staged_count > 0:
                parse_fail_ratio = metrics.parse_fail_count / metrics.staged_count

            health_summary = self._build_health_summary(
                thresholds=source_config.health_thresholds,
                parse_fail_ratio=parse_fail_ratio,
                selector_fail_count=metrics.selector_fail_count,
                page_coverage_ratio=page_coverage_ratio,
            )

            run_metadata.update(
                {
                    "is_healthy": health_summary["is_healthy"],
                    "health_score": health_summary["health_score"],
                    "health_inputs": {
                        "parse_fail_ratio": parse_fail_ratio,
                        "selector_fail_count": metrics.selector_fail_count,
                        "page_coverage_ratio": page_coverage_ratio,
                    },
                    "health_thresholds": source_config.health_thresholds,
                }
            )
            update_run_v3(run_id, {"metadata": run_metadata})
            metrics.supabase_write_count += 1

            _ = supabase.rpc(
                "mark_missing_candidates_v3",
                {
                    "p_run_id": run_id,
                    "p_source": source_config.source_key,
                },
            ).execute()
            metrics.supabase_write_count += 1

            apply_result = None
            if self.mode == "authoritative":
                apply_result = (
                    supabase.rpc(
                        "apply_scrape_diff_v3",
                        {
                            "p_run_id": run_id,
                            "p_source": source_config.source_key,
                            "p_run_type": "reconcile",
                        },
                    )
                    .execute()
                    .data
                )
                metrics.supabase_write_count += 1
                run_metadata["apply_result"] = apply_result

            self._count_diff_events(diff_rows.data or [], metrics)
            self._finalize_success(run_id, started, metrics, run_metadata)

            return {
                "run_id": run_id,
                "source": source_config.source_key,
                "run_type": "reconcile",
                "mode": self.mode,
                "status": "success",
                "listings": len(listings),
                "staged_count": metrics.staged_count,
                "parse_fail_count": metrics.parse_fail_count,
                "inserted": metrics.inserted_count,
                "price_changed": metrics.price_changed_count,
                "sold": metrics.sold_count,
                "removed": metrics.removed_count,
                "unchanged": metrics.unchanged_count,
                "detail_fetch_count": metrics.detail_fetch_count,
                "queue_depth": metrics.queue_depth,
                "queue_oldest_age_minutes": metrics.queue_oldest_age_minutes,
                "notification_latency_seconds_p95": metrics.notification_latency_seconds_p95,
                "apply_result": apply_result,
            }
        except Exception as exc:
            logger.exception("V3 reconcile failed for %s", source_config.source_key)
            self._finalize_error(run_id, started, metrics, run_metadata, str(exc))
            return {
                "run_id": run_id,
                "source": source_config.source_key,
                "run_type": "reconcile",
                "mode": self.mode,
                "status": "error",
                "error": str(exc),
                "queue_depth": metrics.queue_depth,
                "queue_oldest_age_minutes": metrics.queue_oldest_age_minutes,
                "notification_latency_seconds_p95": None,
            }
