import logging

import requests

from http_utils import fetch_with_retry
from scrape_rensendriessen import API_URL, MAX_PAGES, parse_vessel

logger = logging.getLogger(__name__)


class RensenDriessenAdapter:
    source_key = "rensendriessen"

    def scrape_listing(self) -> tuple[list[dict], dict]:
        metrics = {"external_requests": 0, "selector_fail_count": 0, "parse_fail_count": 0}
        rows: list[dict] = []

        page = 1
        while page <= MAX_PAGES:
            metrics["external_requests"] += 1
            resp = fetch_with_retry(requests.post, API_URL, json={"page": page})
            data = resp.json()
            ships = data if isinstance(data, list) else data.get("results", data.get("data", []))
            if not ships:
                break

            for ship in ships:
                try:
                    rows.append(parse_vessel(ship))
                except Exception:
                    logger.exception("Failed to parse RensenDriessen vessel")
                    metrics["parse_fail_count"] += 1
            page += 1

        if not rows:
            metrics["selector_fail_count"] += 1

        return rows, metrics

    def enrich_detail(self, listing_row: dict) -> tuple[dict, dict]:
        # Listing already includes the full payload.
        return dict(listing_row), {"external_requests": 0, "parse_fail_count": 0}
