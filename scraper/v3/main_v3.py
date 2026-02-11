from __future__ import annotations

import argparse
import logging
import os

from db import supabase
from post_ingestion import run_post_ingestion_tasks
from v3.alerting import evaluate_v3_run_alerts
from v3.config import DEFAULT_SOURCE_CONFIGS_V3, SOURCE_ADAPTER_OWNERS_V3
from v3.notifications import dispatch_outbox_notifications_v3
from v3.pipeline import PipelineV3
from v3.sources.galle_v3 import GalleAdapter
from v3.sources.gsk_v3 import GSKAdapter
from v3.sources.gtsschepen_v3 import GTSSchepenAdapter
from v3.sources.pcshipbrokers_v3 import PCShipbrokersAdapter
from v3.sources.rensendriessen_v3 import RensenDriessenAdapter

logger = logging.getLogger(__name__)

ADAPTERS = {
    "galle": GalleAdapter,
    "rensendriessen": RensenDriessenAdapter,
    "pcshipbrokers": PCShipbrokersAdapter,
    "gtsschepen": GTSSchepenAdapter,
    "gsk": GSKAdapter,
}


def _parse_sources(raw_sources: str | None) -> list[str]:
    if raw_sources:
        return [s.strip() for s in raw_sources.split(",") if s.strip()]
    default_raw = os.environ.get("PIPELINE_V3_SOURCES", "galle,rensendriessen,pcshipbrokers,gtsschepen,gsk")
    return [s.strip() for s in default_raw.split(",") if s.strip()]


def run_pipeline_v3(run_type: str, mode: str, sources: list[str]) -> list[dict]:
    detail_budget_per_run = int(os.environ.get("PIPELINE_V3_DETAIL_BUDGET_PER_RUN", "50"))
    max_queue_age_minutes = int(os.environ.get("PIPELINE_V3_MAX_QUEUE_AGE_MINUTES", "60"))
    remove_miss_threshold = int(os.environ.get("PIPELINE_V3_RECONCILE_REMOVE_MISSES", "2"))

    pipeline = PipelineV3(
        mode=mode,
        detail_budget_per_run=detail_budget_per_run,
        max_queue_age_minutes=max_queue_age_minutes,
        remove_miss_threshold=remove_miss_threshold,
    )

    logger.info(
        "Starting pipeline v3: run_type=%s mode=%s sources=%s",
        run_type,
        mode,
        ", ".join(sources),
    )

    results: list[dict] = []
    for source in sources:
        config = DEFAULT_SOURCE_CONFIGS_V3.get(source)
        adapter_cls = ADAPTERS.get(source)
        owner = SOURCE_ADAPTER_OWNERS_V3.get(source)

        if not config:
            logger.warning("Skipping unknown v3 source config: %s", source)
            continue
        if not adapter_cls:
            logger.warning("Skipping source without v3 adapter implementation: %s", source)
            continue
        if not owner:
            raise ValueError(f"Missing source owner mapping for v3 source: {source}")

        adapter = adapter_cls()
        logger.info("Running v3 source %s (owner=%s, adapter=%s)", source, owner, adapter.__class__.__name__)

        if run_type == "detect":
            result = pipeline.run_detect_source(adapter, config)
        elif run_type == "detail-worker":
            result = pipeline.run_detail_worker_source(adapter, config)
        elif run_type == "reconcile":
            result = pipeline.run_reconcile_source(adapter, config)
        else:
            raise ValueError(f"Unsupported run type: {run_type}")

        results.append(result)
        logger.info(
            "v3 %s %s: status=%s listings=%s inserted=%s price_changed=%s sold=%s removed=%s unchanged=%s detail_fetch=%s",
            run_type,
            source,
            result.get("status"),
            result.get("listings"),
            result.get("inserted"),
            result.get("price_changed"),
            result.get("sold"),
            result.get("removed"),
            result.get("unchanged"),
            result.get("detail_fetch_count"),
        )

    logger.info("Pipeline v3 completed for %d source(s)", len(results))
    return results


def _collect_reconcile_post_ingestion_candidates(results: list[dict]) -> list[str] | None:
    """Collect vessel IDs that need post-ingestion work from reconcile diff events."""
    run_ids = [
        str(r.get("run_id"))
        for r in results
        if r.get("status") == "success" and r.get("run_type") == "reconcile" and r.get("run_id")
    ]
    if not run_ids:
        return []

    try:
        rows = (
            supabase.table("scrape_diff_events_v3")
            .select("vessel_id,event_type,payload")
            .in_("run_id", run_ids)
            .not_.is_("vessel_id", "null")
            .execute()
            .data
            or []
        )
    except Exception:
        logger.exception("Failed to load reconcile diff events; falling back to full post-ingestion scope")
        return None

    candidates: list[str] = []
    seen: set[str] = set()

    for row in rows:
        vessel_id = row.get("vessel_id")
        if not vessel_id:
            continue

        event_type = str(row.get("event_type") or "")
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        has_detail_payload = bool(
            payload and (payload.get("raw_details") is not None or payload.get("image_urls") is not None)
        )
        should_include = event_type in {"inserted", "price_changed", "sold"} or has_detail_payload

        vessel_id_str = str(vessel_id)
        if should_include and vessel_id_str not in seen:
            seen.add(vessel_id_str)
            candidates.append(vessel_id_str)

    logger.info(
        "Post-ingestion candidate selection: %d vessel(s) from %d reconcile run(s)",
        len(candidates),
        len(run_ids),
    )
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-type", choices=["detect", "detail-worker", "reconcile"], required=True)
    parser.add_argument("--mode", choices=["shadow", "authoritative"], default=None)
    parser.add_argument("--sources", default=None, help="Comma-separated source allowlist")
    args = parser.parse_args()

    mode = (args.mode or os.environ.get("PIPELINE_V3_MODE", "shadow")).strip().lower()
    if mode not in {"shadow", "authoritative"}:
        raise ValueError("PIPELINE_V3_MODE must be 'shadow' or 'authoritative'")

    sources = _parse_sources(args.sources)
    results = run_pipeline_v3(args.run_type, mode, sources)

    try:
        evaluate_v3_run_alerts(results)
    except Exception:
        logger.exception("V3 alert evaluation failed")

    notifications_mode = os.environ.get("PIPELINE_V3_NOTIFICATIONS", "off").strip().lower()
    if mode == "authoritative" and notifications_mode == "on":
        try:
            dispatch_result = dispatch_outbox_notifications_v3()
            logger.info("V3 outbox dispatch: %s", dispatch_result)
        except Exception:
            logger.exception("V3 outbox dispatch failed")

    if mode == "authoritative" and args.run_type == "reconcile":
        run_post_ingestion = os.environ.get("PIPELINE_V3_RUN_POST_INGESTION", "on").strip().lower()
        if run_post_ingestion == "on":
            post_ingestion_scope = os.environ.get("PIPELINE_V3_POST_INGESTION_SCOPE", "full").strip().lower()
            candidate_ids: list[str] | None = None
            if post_ingestion_scope == "incremental":
                candidate_ids = _collect_reconcile_post_ingestion_candidates(results)
            run_post_ingestion_tasks(changed_vessel_ids=candidate_ids, scope=post_ingestion_scope)

    successes = [r for r in results if r.get("status") == "success"]
    if results and not successes:
        raise RuntimeError("All v3 sources failed in this run")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    main()
