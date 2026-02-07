import logging
from datetime import datetime, timezone

import scrape_rensendriessen
import scrape_galle
import scrape_pcshipbrokers
import scrape_gtsschepen
import scrape_gsk
from db import clear_changes, get_changes, mark_removed, run_dedup
from notifications import send_summary_email

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
    logger.info("Starting scrape...")
    clear_changes()

    all_stats = []
    removed_total = 0
    for name, module, source_key in SCRAPERS:
        run_start = datetime.now(timezone.utc).isoformat()
        try:
            stats = module.scrape()
        except Exception:
            logger.exception("%s scraper failed", name)
            stats = _empty_stats()

        logger.info(
            "%s — total: %d, inserted: %d, price_changed: %d, unchanged: %d, errors: %d",
            name, stats["total"], stats["inserted"], stats["price_changed"],
            stats["unchanged"], stats.get("error", 0),
        )
        if stats["total"] == 0:
            logger.warning(
                "⚠ %s returned 0 vessels — site structure may have changed!", name,
            )
        else:
            # Mark vessels not seen in this run as removed
            removed = mark_removed(source_key, run_start)
            removed_total += removed

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
    send_summary_email(combined_stats, changes)


if __name__ == "__main__":
    main()
