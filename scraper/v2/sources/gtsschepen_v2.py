import logging

import requests
from bs4 import BeautifulSoup

from http_utils import fetch_with_retry
from scrape_gtsschepen import BASE_URL, MAX_PAGES, parse_card, _fetch_detail, _enrich_from_details

logger = logging.getLogger(__name__)


class GTSSchepenAdapter:
    source_key = "gtsschepen"

    def scrape_listing(self) -> tuple[list[dict], dict]:
        metrics = {"external_requests": 0, "selector_fail_count": 0, "parse_fail_count": 0}
        rows: list[dict] = []

        page = 1
        while page <= MAX_PAGES:
            url = BASE_URL if page == 1 else f"{BASE_URL}page/{page}/"
            metrics["external_requests"] += 1
            try:
                resp = fetch_with_retry(requests.get, url)
            except requests.RequestException:
                logger.warning("Failed to fetch GTS page %d; stopping", page)
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            cards = soup.select(".grid-item")
            if not cards:
                if page == 1:
                    metrics["selector_fail_count"] += 1
                break

            for card in cards:
                try:
                    vessel = parse_card(card)
                except Exception:
                    logger.exception("Failed to parse GTS card")
                    metrics["parse_fail_count"] += 1
                    continue
                if vessel is None:
                    continue
                rows.append(vessel)

            page += 1

        return rows, metrics

    def enrich_detail(self, listing_row: dict) -> tuple[dict, dict]:
        metrics = {"external_requests": 0, "parse_fail_count": 0}
        vessel = dict(listing_row)

        if vessel.get("url"):
            metrics["external_requests"] += 1
            detail = _fetch_detail(vessel["url"])
            vessel["raw_details"] = detail.get("raw_details")
            vessel["image_urls"] = detail.get("image_urls")
            if detail.get("raw_details"):
                _enrich_from_details(vessel, detail["raw_details"])

        return vessel, metrics
