import logging

import scrape_rensendriessen
import scrape_galle
from db import clear_changes, get_changes
from notifications import send_summary_email

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def _empty_stats():
    return {"total": 0, "inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0}


def main():
    logger.info("Starting scrape...")
    clear_changes()

    # --- RensenDriessen ---
    try:
        rd_stats = scrape_rensendriessen.scrape()
    except Exception:
        logger.exception("RensenDriessen scraper failed")
        rd_stats = _empty_stats()

    logger.info(
        "RensenDriessen — total: %d, inserted: %d, price_changed: %d, unchanged: %d, errors: %d",
        rd_stats["total"], rd_stats["inserted"], rd_stats["price_changed"],
        rd_stats["unchanged"], rd_stats.get("error", 0),
    )

    # --- Galle ---
    try:
        galle_stats = scrape_galle.scrape()
    except Exception:
        logger.exception("Galle scraper failed")
        galle_stats = _empty_stats()

    logger.info(
        "Galle — total: %d, inserted: %d, price_changed: %d, unchanged: %d, errors: %d",
        galle_stats["total"], galle_stats["inserted"], galle_stats["price_changed"],
        galle_stats["unchanged"], galle_stats.get("error", 0),
    )

    total = rd_stats["total"] + galle_stats["total"]
    logger.info("Done. %d vessels processed.", total)

    # Send notification email with all detected changes
    combined_stats = {
        "total": total,
        "inserted": rd_stats["inserted"] + galle_stats["inserted"],
        "price_changed": rd_stats["price_changed"] + galle_stats["price_changed"],
        "unchanged": rd_stats["unchanged"] + galle_stats["unchanged"],
    }
    changes = get_changes()
    logger.info("Changes detected: %d", len(changes))
    send_summary_email(combined_stats, changes)


if __name__ == "__main__":
    main()
