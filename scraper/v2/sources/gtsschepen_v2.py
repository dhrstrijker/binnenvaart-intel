import logging

import requests
from bs4 import BeautifulSoup

from http_utils import fetch_with_retry, get_http_status, is_non_retryable_http_error
from scrape_gtsschepen import BASE_URL, MAX_PAGES, parse_card, _fetch_detail, _enrich_from_details
from v2.sources.contracts import new_detail_metrics, new_listing_metrics

logger = logging.getLogger(__name__)


class GTSSchepenAdapter:
    source_key = "gtsschepen"
    owner = "scraper-pipeline"

    def scrape_listing(self) -> tuple[list[dict], dict]:
        metrics = new_listing_metrics()
        rows: list[dict] = []

        page = 1
        while page <= MAX_PAGES:
            url = BASE_URL if page == 1 else f"{BASE_URL}page/{page}/"
            metrics["external_requests"] += 1
            try:
                resp = fetch_with_retry(requests.get, url)
            except requests.RequestException as exc:
                status = get_http_status(exc)
                # GTS pagination ends with 404 on non-existing trailing pages.
                # Treat this as a normal pagination stop once page 1 succeeded.
                if status == 404 and page > 1:
                    logger.info("GTS page %d returned 404; stopping pagination.", page)
                    break
                if is_non_retryable_http_error(exc):
                    raise
                logger.warning("Failed to fetch GTS page %d; stopping", page)
                break

            soup = BeautifulSoup(resp.text, "html.parser")
            cards = soup.select(".grid-item")
            if not cards:
                if page == 1:
                    metrics["selector_fail_count"] += 1
                    metrics["page_coverage_ratio"] = 0.0
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
        metrics = new_detail_metrics()
        vessel = dict(listing_row)

        if vessel.get("url"):
            metrics["external_requests"] += 1
            detail = _fetch_detail(vessel["url"])
            vessel["raw_details"] = detail.get("raw_details")
            vessel["image_urls"] = detail.get("image_urls")
            if detail.get("raw_details"):
                _enrich_from_details(vessel, detail["raw_details"])

        return vessel, metrics
