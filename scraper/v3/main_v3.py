from __future__ import annotations

import argparse
import logging
import os

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
            run_post_ingestion_tasks()

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
