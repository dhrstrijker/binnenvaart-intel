import logging

import requests

from http_utils import fetch_with_retry
from scrape_pcshipbrokers import LISTING_URL, _parse_listing, _fetch_detail

logger = logging.getLogger(__name__)


class PCShipbrokersAdapter:
    source_key = "pcshipbrokers"

    def scrape_listing(self) -> tuple[list[dict], dict]:
        metrics = {"external_requests": 1, "selector_fail_count": 0, "parse_fail_count": 0}
        resp = fetch_with_retry(requests.get, LISTING_URL)
        try:
            rows = _parse_listing(resp.text)
        except Exception:
            logger.exception("Failed to parse PC Shipbrokers listing")
            rows = []
            metrics["parse_fail_count"] += 1

        if not rows:
            metrics["selector_fail_count"] += 1

        return rows, metrics

    def enrich_detail(self, listing_row: dict) -> tuple[dict, dict]:
        metrics = {"external_requests": 0, "parse_fail_count": 0}
        vessel = dict(listing_row)

        if vessel.get("url"):
            metrics["external_requests"] += 1
            detail = _fetch_detail(vessel["url"])
            vessel["raw_details"] = detail.get("raw_details")
            vessel["image_urls"] = detail.get("image_urls")

        return vessel, metrics
