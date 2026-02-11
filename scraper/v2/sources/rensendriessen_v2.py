import logging

import requests

from http_utils import fetch_with_retry
from scrape_rensendriessen import API_URL, MAX_PAGES, parse_vessel
from v2.sources.contracts import new_detail_metrics, new_listing_metrics
from v2.sources.pagination import resolve_listing_page_cap

logger = logging.getLogger(__name__)


class RensenDriessenAdapter:
    source_key = "rensendriessen"
    owner = "scraper-pipeline"

    def scrape_listing(self) -> tuple[list[dict], dict]:
        metrics = new_listing_metrics()
        rows: list[dict] = []
        max_pages = resolve_listing_page_cap(self.source_key, default_cap=MAX_PAGES) or MAX_PAGES

        page = 1
        while page <= max_pages:
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
            metrics["page_coverage_ratio"] = 0.0

        return rows, metrics

    def enrich_detail(self, listing_row: dict) -> tuple[dict, dict]:
        # Listing already includes the full payload.
        return dict(listing_row), new_detail_metrics()
