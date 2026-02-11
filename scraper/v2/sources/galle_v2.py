import logging

import requests
from bs4 import BeautifulSoup

from http_utils import fetch_with_retry
from scrape_galle import URL as GALLE_URL, parse_card, _fetch_detail

logger = logging.getLogger(__name__)


class GalleAdapter:
    source_key = "galle"

    def scrape_listing(self) -> tuple[list[dict], dict]:
        metrics = {"external_requests": 1, "selector_fail_count": 0, "parse_fail_count": 0}

        resp = fetch_with_retry(requests.get, GALLE_URL)
        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select(".cat-product-small")
        if not cards:
            metrics["selector_fail_count"] += 1

        rows = []
        for card in cards:
            try:
                vessel = parse_card(card)
            except Exception:
                logger.exception("Failed to parse galle listing card")
                metrics["parse_fail_count"] += 1
                continue
            if not vessel.get("source_id"):
                metrics["parse_fail_count"] += 1
                continue
            rows.append(vessel)

        return rows, metrics

    def enrich_detail(self, listing_row: dict) -> tuple[dict, dict]:
        metrics = {"external_requests": 0, "parse_fail_count": 0}

        vessel = dict(listing_row)
        detail_url = vessel.get("url")
        if not detail_url:
            return vessel, metrics

        metrics["external_requests"] += 1
        detail = _fetch_detail(detail_url)
        if detail.get("type") is not None:
            vessel["type"] = detail["type"]
        if detail.get("build_year") is not None:
            vessel["build_year"] = detail["build_year"]
        if detail.get("tonnage") is not None:
            vessel["tonnage"] = detail["tonnage"]

        # Explicit null-clearing policy for enrichment fields.
        vessel["raw_details"] = detail.get("raw_details")
        vessel["image_urls"] = detail.get("image_urls")

        return vessel, metrics
