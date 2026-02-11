import logging
import time

from scrape_gsk import PAGE_SIZE, GRAPHQL_URL, QUERY, _fetch_with_retry, parse_vessel, _fetch_detail

logger = logging.getLogger(__name__)


class GSKAdapter:
    source_key = "gsk"

    def scrape_listing(self) -> tuple[list[dict], dict]:
        metrics = {"external_requests": 0, "selector_fail_count": 0, "parse_fail_count": 0}
        rows: list[dict] = []

        skip = 0
        total_count = None
        while True:
            metrics["external_requests"] += 1
            resp = _fetch_with_retry(
                GRAPHQL_URL,
                {
                    "query": QUERY,
                    "variables": {"skip": skip, "limit": PAGE_SIZE},
                },
            )
            data = resp.json()
            get_vessels = data.get("data", {}).get("getVessels", {})
            vessels = get_vessels.get("vessels") or []
            if total_count is None:
                total_count = get_vessels.get("totalCount", 0)

            if not vessels:
                break

            for v in vessels:
                try:
                    parsed = parse_vessel(v)
                except Exception:
                    logger.exception("Failed to parse GSK vessel")
                    metrics["parse_fail_count"] += 1
                    continue
                if parsed is None:
                    continue
                rows.append(parsed)

            skip += PAGE_SIZE
            if skip >= (total_count or 0):
                break

        if not rows:
            metrics["selector_fail_count"] += 1

        return rows, metrics

    def enrich_detail(self, listing_row: dict) -> tuple[dict, dict]:
        metrics = {"external_requests": 0, "parse_fail_count": 0}
        vessel = dict(listing_row)
        slug = vessel.get("source_id")

        if slug:
            time.sleep(0.4)
            metrics["external_requests"] += 1
            detail = _fetch_detail(slug)
            if detail:
                existing_raw = vessel.get("raw_details") or {}
                existing_raw.update(detail)
                vessel["raw_details"] = existing_raw

        return vessel, metrics
