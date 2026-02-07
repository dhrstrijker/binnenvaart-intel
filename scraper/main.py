import argparse
import logging
from datetime import datetime, timezone

import scrape_rensendriessen
import scrape_galle
import scrape_pcshipbrokers
import scrape_gtsschepen
import scrape_gsk
import alerting
from db import clear_changes, get_changes, mark_removed, run_dedup
from notifications import send_personalized_notifications, send_digest

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
            alerting.alert_scraper_failure(name, str(e))
            stats = _empty_stats()

        logger.info(
            "%s — total: %d, inserted: %d, price_changed: %d, unchanged: %d, errors: %d",
            name, stats["total"], stats["inserted"], stats["price_changed"],
            stats["unchanged"], stats.get("error", 0),
        )

        # Circuit breaker: decide whether mark_removed() is safe to call
        if stats["total"] == 0:
            logger.warning("⚠ %s returned 0 vessels — skipping mark_removed", name)
            alerting.alert_zero_vessels(name, alerting.get_historical_avg(source_key))
            alerting.log_scraper_run(source_key, 0, "error")
        elif not alerting.should_allow_mark_removed(source_key, stats["total"]):
            historical_avg = alerting.get_historical_avg(source_key)
            logger.error(
                "🛑 %s returned %d vessels (expected ~%d) — mark_removed BLOCKED!",
                name, stats["total"], historical_avg,
            )
            alerting.alert_vessel_count_drop(name, stats["total"], historical_avg)
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

    combined_stats = {
        "total": total,
        "inserted": sum(s["inserted"] for s in all_stats),
        "price_changed": sum(s["price_changed"] for s in all_stats),
        "unchanged": sum(s["unchanged"] for s in all_stats),
    }
    changes = get_changes()
    logger.info("Changes detected: %d", len(changes))
    send_personalized_notifications(combined_stats, changes)

    # Send daily digest after scraping
    logger.info("Sending daily digest...")
    send_digest("daily")


if __name__ == "__main__":
    main()
