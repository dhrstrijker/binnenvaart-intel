import argparse
import logging
import os
from datetime import datetime, timezone

from db import get_changes_since
from notifications import send_personalized_notifications, send_digest
from post_ingestion import run_post_ingestion_tasks
from v2.alerting_v2 import evaluate_v2_run_alerts
from v2.main_v2 import run_pipeline_v2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

def _stats_from_changes(changes: list[dict]) -> dict:
    inserted = sum(1 for c in changes if c.get("kind") == "inserted")
    price_changed = sum(1 for c in changes if c.get("kind") == "price_changed")
    unchanged = 0
    return {
        "total": len(changes),
        "inserted": inserted,
        "price_changed": price_changed,
        "unchanged": unchanged,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--digest-only", choices=["daily", "weekly"], help="Only send digest, skip scraping")
    args = parser.parse_args()

    if args.digest_only:
        logger.info("Running in digest-only mode: %s", args.digest_only)
        send_digest(args.digest_only)
        return

    run_start_iso = datetime.now(timezone.utc).isoformat()

    # V2 is authoritative; V1 execution path has been decommissioned.
    try:
        v2_results = run_pipeline_v2()
        evaluate_v2_run_alerts(v2_results)
    except Exception:
        logger.exception("Pipeline v2 run failed")
        raise

    run_post_ingestion_tasks()

    changes = get_changes_since(run_start_iso)
    logger.info("Changes detected since run start: %d", len(changes))
    combined_stats = _stats_from_changes(changes)

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
