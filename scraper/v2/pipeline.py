import logging
import time
from datetime import datetime, timezone

from db import supabase
from v2.config import SourceConfig
from v2.fingerprint import make_fingerprint
from v2.metrics import RunMetrics

logger = logging.getLogger(__name__)


class PipelineV2:
    def __init__(self, mode: str = "shadow"):
        self.mode = mode

    def start_run(self, source: str, metadata: dict | None = None) -> str:
        row = (
            supabase.table("scrape_runs_v2")
            .insert(
                {
                    "source": source,
                    "mode": self.mode,
                    "status": "running",
                    "metadata": metadata or {},
                }
            )
            .execute()
        )
        return row.data[0]["id"]

    def _read_existing_fingerprints(self, source: str) -> dict[str, str]:
        result = (
            supabase.table("vessels")
            .select("source_id, raw_details, name, type, length_m, width_m, tonnage, build_year, price, url, image_url, image_urls, status")
            .eq("source", source)
            .execute()
        )
        data = result.data or []
        by_id: dict[str, str] = {}
        for row in data:
            source_id = row.get("source_id")
            if not source_id:
                continue
            # Fingerprint on listing-shape fields so detail fetch gating can
            # skip unchanged rows before expensive detail requests.
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

    @staticmethod
    def _listing_shape(payload: dict) -> dict:
        """Stable subset of listing fields for detail-fetch gating."""
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
        supabase.table("scrape_listing_staging").upsert(rows, on_conflict="run_id,source,source_id").execute()

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
        supabase.table("scrape_vessel_staging").upsert(rows, on_conflict="run_id,source,source_id").execute()

    def run_source(self, adapter, source_config: SourceConfig) -> dict:
        started = time.monotonic()
        metrics = RunMetrics()
        run_id = self.start_run(source_config.source_key, metadata={"adapter": adapter.__class__.__name__})

        try:
            listings, adapter_metrics = adapter.scrape_listing()
            metrics.external_request_count += adapter_metrics.get("external_requests", 0)
            metrics.parse_fail_count += adapter_metrics.get("parse_fail_count", 0)
            metrics.selector_fail_count += adapter_metrics.get("selector_fail_count", 0)
            metrics.staged_count = len(listings)
            page_coverage_ratio = float(adapter_metrics.get("page_coverage_ratio", 1.0))

            self._insert_listing_staging(run_id, source_config.source_key, listings)
            metrics.supabase_write_count += 1

            existing_fps = self._read_existing_fingerprints(source_config.source_key)
            metrics.supabase_read_count += 1

            vessels = []
            for listing in listings:
                source_id = str(listing["source_id"])
                listing_fp = make_fingerprint(self._listing_shape(listing))
                should_fetch_detail = source_config.detail_fetch_policy == "always" or (
                    source_config.detail_fetch_policy == "new_or_changed"
                    and existing_fps.get(source_id) != listing_fp
                )

                if should_fetch_detail:
                    vessel, detail_metrics = adapter.enrich_detail(listing)
                    metrics.external_request_count += detail_metrics.get("external_requests", 0)
                    metrics.parse_fail_count += detail_metrics.get("parse_fail_count", 0)
                    metrics.detail_fetch_count += 1
                else:
                    vessel = dict(listing)

                vessels.append(vessel)

            self._insert_vessel_staging(run_id, source_config.source_key, vessels)
            metrics.supabase_write_count += 1

            diff_rows = supabase.rpc(
                "compute_scrape_diff",
                {"p_run_id": run_id, "p_source": source_config.source_key},
            ).execute()
            metrics.supabase_write_count += 1

            _ = supabase.rpc(
                "mark_missing_candidates",
                {"p_run_id": run_id, "p_source": source_config.source_key},
            ).execute()
            metrics.supabase_write_count += 1

            apply_result = None
            if self.mode == "authoritative":
                apply_result = supabase.rpc(
                    "apply_scrape_diff",
                    {"p_run_id": run_id, "p_source": source_config.source_key},
                ).execute().data
                metrics.supabase_write_count += 1

            for row in diff_rows.data or []:
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

            parse_fail_ratio = 0.0
            if metrics.staged_count > 0:
                parse_fail_ratio = metrics.parse_fail_count / metrics.staged_count

            health_summary = self._build_health_summary(
                thresholds=source_config.health_thresholds,
                parse_fail_ratio=parse_fail_ratio,
                selector_fail_count=metrics.selector_fail_count,
                page_coverage_ratio=page_coverage_ratio,
            )

            duration = time.monotonic() - started
            update = metrics.to_db_update()
            update.update(
                {
                    "status": "success",
                    "run_duration_seconds": round(duration, 3),
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            run_metadata = {
                "adapter": adapter.__class__.__name__,
                "is_healthy": health_summary["is_healthy"],
                "health_score": health_summary["health_score"],
                "health_inputs": {
                    "parse_fail_ratio": parse_fail_ratio,
                    "selector_fail_count": metrics.selector_fail_count,
                    "page_coverage_ratio": page_coverage_ratio,
                },
                "health_thresholds": source_config.health_thresholds,
            }
            if apply_result is not None:
                run_metadata["apply_result"] = apply_result
            update["metadata"] = run_metadata

            supabase.table("scrape_runs_v2").update(update).eq("id", run_id).execute()
            metrics.supabase_write_count += 1

            return {
                "run_id": run_id,
                "source": source_config.source_key,
                "mode": self.mode,
                "listings": len(listings),
                "inserted": metrics.inserted_count,
                "price_changed": metrics.price_changed_count,
                "sold": metrics.sold_count,
                "removed": metrics.removed_count,
                "unchanged": metrics.unchanged_count,
                "detail_fetch_count": metrics.detail_fetch_count,
                "apply_result": apply_result,
                "is_healthy": health_summary["is_healthy"],
                "health_score": health_summary["health_score"],
            }
        except Exception as exc:
            duration = time.monotonic() - started
            supabase.table("scrape_runs_v2").update(
                {
                    "status": "error",
                    "error_message": str(exc)[:500],
                    "run_duration_seconds": round(duration, 3),
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    **metrics.to_db_update(),
                }
            ).eq("id", run_id).execute()
            raise

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

        parse_component = 1.0 - min(parse_fail_ratio / max(max_parse_fail_ratio, 0.0001), 1.0)
        selector_component = 1.0 - min(selector_fail_count / max(max_selector_fail_count, 1), 1.0)
        coverage_component = min(page_coverage_ratio / max(min_page_coverage_ratio, 0.0001), 1.0)
        health_score = round((parse_component + selector_component + coverage_component) / 3.0, 4)

        return {
            "is_healthy": is_healthy,
            "health_score": health_score,
        }
