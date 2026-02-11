import argparse
import logging
import os
from datetime import datetime, timezone

import scrape_rensendriessen
import scrape_galle
import scrape_pcshipbrokers
import scrape_gtsschepen
import scrape_gsk
import alerting
from db import clear_changes, get_changes, mark_removed, run_dedup, supabase
from notifications import send_personalized_notifications, send_digest
from v2.main_v2 import run_pipeline_v2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# (display name, module, DB source key)
SCRAPERS = [
    ("RensenDriessen", scrape_rensendriessen, "rensendriessen"),
    ("Galle", scrape_galle, "galle"),
    ("PC Shipbrokers", scrape_pcshipbrokers, "pcshipbrokers"),
    ("GTS Schepen", scrape_gtsschepen, "gtsschepen"),
    ("GSK Brokers", scrape_gsk, "gsk"),
]


def _empty_stats():
    return {"total": 0, "inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--digest-only", choices=["daily", "weekly"], help="Only send digest, skip scraping")
    args = parser.parse_args()

    if args.digest_only:
        logger.info("Running in digest-only mode: %s", args.digest_only)
        send_digest(args.digest_only)
        return

    # V2 migration mode (shadow/authoritative), controlled by env flags.
    v2_enabled = os.environ.get("PIPELINE_V2_ENABLED", "false").strip().lower() in ("1", "true", "yes")
    v2_only = os.environ.get("PIPELINE_V2_ONLY", "false").strip().lower() in ("1", "true", "yes")
    if v2_enabled:
        try:
            run_pipeline_v2()
        except Exception:
            logger.exception("Pipeline v2 run failed")
            if v2_only:
                raise
        if v2_only:
            logger.info("PIPELINE_V2_ONLY enabled; skipping legacy pipeline.")
            return

    logger.info("Starting scrape...")
    clear_changes()

    all_stats = []
    removed_total = 0
    for name, module, source_key in SCRAPERS:
        run_start = datetime.now(timezone.utc).isoformat()
        try:
            stats = module.scrape()
        except Exception as e:
            logger.exception("%s scraper failed", name)
            alerting.alert_scraper_failure(name, str(e), source_key=source_key)
            stats = _empty_stats()

        logger.info(
            "%s — total: %d, inserted: %d, price_changed: %d, unchanged: %d, errors: %d",
            name, stats["total"], stats["inserted"], stats["price_changed"],
            stats["unchanged"], stats.get("error", 0),
        )

        # Circuit breaker: decide whether mark_removed() is safe to call
        if stats["total"] == 0:
            logger.warning("⚠ %s returned 0 vessels — skipping mark_removed", name)
            alerting.alert_zero_vessels(name, alerting.get_historical_avg(source_key), source_key=source_key)
            alerting.log_scraper_run(source_key, 0, "error")
        elif not alerting.should_allow_mark_removed(source_key, stats["total"]):
            historical_avg = alerting.get_historical_avg(source_key)
            logger.error(
                "🛑 %s returned %d vessels (expected ~%d) — mark_removed BLOCKED!",
                name, stats["total"], historical_avg,
            )
            alerting.alert_vessel_count_drop(name, stats["total"], historical_avg, source_key=source_key)
            alerting.log_scraper_run(source_key, stats["total"], "blocked")
        else:
            # Safe: count is within normal range
            removed = mark_removed(source_key, run_start)
            removed_total += removed
            alerting.log_scraper_run(source_key, stats["total"], "success")
            alerting.resolve_open_alerts(source_key)

        all_stats.append(stats)

    total = sum(s["total"] for s in all_stats)
    logger.info("Done. %d vessels processed, %d marked removed.", total, removed_total)

    # Run deduplication across sources
    try:
        dedup_result = run_dedup()
        logger.info(
            "Dedup: %d clusters, %d duplicates linked",
            dedup_result["clusters"], dedup_result["linked"],
        )
    except Exception:
        logger.exception("Deduplication failed")

    # Run condition extraction + price prediction (non-fatal)
    try:
        from haiku_extract import run_extraction
        from price_model import predict_all

        all_vessels = supabase.table("vessels").select(
            "id, name, type, length_m, width_m, tonnage, build_year, price, source, "
            "raw_details, condition_signals_hash, condition_signals, "
            "structured_details_hash, structured_details"
        ).eq("status", "active").execute().data or []
        logger.info("Running condition extraction on %d active vessels...", len(all_vessels))
        extraction_result = run_extraction(all_vessels)
        logger.info(
            "Extraction: %d extracted, %d skipped, %d errors",
            extraction_result["extracted"], extraction_result["skipped"], extraction_result["errors"],
        )

        # Run structured data extraction (comprehensive vessel specs)
        from structured_extract import run_extraction as run_structured_extraction
        logger.info("Running structured extraction on %d active vessels...", len(all_vessels))
        struct_result = run_structured_extraction(all_vessels)
        logger.info(
            "Structured extraction: %d extracted, %d skipped, %d errors",
            struct_result["extracted"], struct_result["skipped"], struct_result["errors"],
        )

        # Re-fetch to get updated condition_signals for prediction
        all_vessels = supabase.table("vessels").select(
            "id, name, type, length_m, width_m, tonnage, build_year, price, source, "
            "condition_signals"
        ).eq("status", "active").execute().data or []
        logger.info("Running price predictions on %d active vessels...", len(all_vessels))
        prediction_result = predict_all(all_vessels)
        logger.info(
            "Predictions: %d predicted, %d suppressed, %d errors",
            prediction_result["predicted"], prediction_result["suppressed"], prediction_result["errors"],
        )
    except Exception:
        logger.exception("Condition extraction / price prediction failed (non-fatal)")

    combined_stats = {
        "total": total,
        "inserted": sum(s["inserted"] for s in all_stats),
        "price_changed": sum(s["price_changed"] for s in all_stats),
        "unchanged": sum(s["unchanged"] for s in all_stats),
    }
    changes = get_changes()
    logger.info("Changes detected: %d", len(changes))
    notifications_mode = os.environ.get("PIPELINE_V2_NOTIFICATIONS", "on").strip().lower()
    if notifications_mode == "off":
        logger.info("Notifications disabled by PIPELINE_V2_NOTIFICATIONS=off")
    else:
        send_personalized_notifications(combined_stats, changes)
        # Send daily digest after scraping
        logger.info("Sending daily digest...")
        send_digest("daily")


if __name__ == "__main__":
    main()
