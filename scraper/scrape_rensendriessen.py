import logging
import re
import time

import requests

from db import upsert_vessel

logger = logging.getLogger(__name__)

API_URL = "https://api.rensendriessen.com/api/public/ships/brokers/list/filter/"
MAX_PAGES = 50


def _fetch_with_retry(method, url, retries=3, **kwargs):
    """Fetch a URL with exponential-backoff retries on network errors."""
    for attempt in range(1, retries + 1):
        try:
            resp = method(url, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            if attempt == retries:
                raise
            wait = 2 ** (attempt - 1)
            logger.warning("Attempt %d failed: %s. Retrying in %ds...", attempt, e, wait)
            time.sleep(wait)


def parse_dimension(value):
    """Parse a dimension like '110,00m' or 110.0 to float."""
    if value is None:
        return None
    s = str(value).strip().lower().replace("m", "").replace(",", ".").strip()
    if not s:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_vessel(ship: dict) -> dict:
    """Convert a RensenDriessen API ship object to our vessel schema."""
    ship_id = ship.get("ship_id") or ship.get("id")

    price = None
    if not ship.get("hide_price"):
        raw = ship.get("sales_asking_price")
        if raw is not None:
            try:
                price = float(str(raw).replace(",", "."))
            except (ValueError, TypeError):
                price = None

    images = ship.get("images") or []
    image_url = images[0].get("original") if images else None

    # Store all image URLs with metadata
    image_urls = [
        {
            "original": img.get("original"),
            "thumbnail": img.get("thumbnail"),
            "sorting_no": img.get("sorting_no"),
        }
        for img in images
        if img.get("original")
    ]

    # Store full API response as raw_details, excluding images (stored separately)
    # and bin_* fields (all empty/unused)
    raw_details = {
        k: v for k, v in ship.items()
        if k != "images" and not k.startswith("bin_")
    }

    # Extract max tonnage from draft-specific fields
    tonnage_fields = [
        "tonnage_1_50", "tonnage_2_00", "tonnage_2_50",
        "tonnage_2_60", "tonnage_2_80", "tonnage_3_00m", "tonnage_3_50m",
        "tonnage_max",
    ]
    tonnage_values = [ship.get(f) for f in tonnage_fields if ship.get(f)]
    tonnage = max(tonnage_values) if tonnage_values else None

    return {
        "source": "rensendriessen",
        "source_id": str(ship_id),
        "name": ship.get("shipname"),
        "type": ship.get("ship_type"),
        "length_m": parse_dimension(ship.get("ship_length")),
        "width_m": parse_dimension(ship.get("ship_width")),
        "tonnage": tonnage,
        "build_year": ship.get("build_year"),
        "price": price,
        "url": f"https://rensendriessen.com/aanbod/{ship_id}",
        "image_url": image_url,
        "raw_details": raw_details,
        "image_urls": image_urls or None,
        "is_sold": bool(ship.get("is_sold")),
    }


def scrape() -> dict:
    """Scrape all pages and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0, "total": 0}

    page = 1
    while page <= MAX_PAGES:
        logger.info("Fetching page %d...", page)
        resp = _fetch_with_retry(requests.post, API_URL, json={"page": page})
        data = resp.json()

        ships = data if isinstance(data, list) else data.get("results", data.get("data", []))

        if not ships:
            logger.info("Page %d returned 0 results, stopping.", page)
            break

        for ship in ships:
            vessel = parse_vessel(ship)
            result = upsert_vessel(vessel)
            stats[result] += 1
            stats["total"] += 1

        page += 1

    logger.info("Scraped %d pages, %d vessels total.", page - 1, stats["total"])
    return stats


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    summary = scrape()
    logger.info("RensenDriessen: %s", summary)
