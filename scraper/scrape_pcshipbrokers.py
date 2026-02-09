import json
import logging
import re
import time

import requests
from bs4 import BeautifulSoup

from db import upsert_vessel
from http_utils import fetch_with_retry as _fetch_with_retry
from parsing import parse_price, parse_dimensions, parse_build_year, parse_tonnage

logger = logging.getLogger(__name__)

LISTING_URL = "https://pcshipbrokers.com/scheepsaanbod"


def _parse_listing(html: str) -> list[dict]:
    """Parse the listing page and return vessel dicts.

    Uses the embedded compareShipData JSON for structured data,
    plus HTML card parsing for the vessel type (not in the JSON).
    """
    soup = BeautifulSoup(html, "html.parser")

    # Extract compareShipData JSON from <script> tag
    # Format: compareShipData: JSON.parse('{...}') with \u0022 escaped quotes
    compare_data = {}
    for script in soup.find_all("script"):
        text = script.string or ""
        if "compareShipData" not in text:
            continue
        # Match JSON.parse('...') format
        match = re.search(r"compareShipData:\s*JSON\.parse\('(.+?)'\)", text, re.DOTALL)
        if match:
            try:
                raw = match.group(1)
                # Decode unicode escapes (\u0022 -> ")
                decoded = raw.encode().decode("unicode_escape")
                compare_data = json.loads(decoded)
            except (json.JSONDecodeError, UnicodeDecodeError):
                logger.warning("Failed to parse compareShipData JSON")
        if not compare_data:
            # Fallback: try direct assignment format
            match = re.search(r"compareShipData\s*=\s*(\{.+\})", text, re.DOTALL)
            if match:
                try:
                    compare_data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    pass
        break

    if not compare_data:
        logger.warning("compareShipData not found, falling back to HTML-only parsing")

    # Parse HTML cards to extract type per vessel slug
    type_by_slug = {}
    for link in soup.select('a[href*="/ships/"]'):
        href = link.get("href", "")
        slug_match = re.search(r"/ships/([^/]+?)/?$", href)
        if not slug_match:
            continue
        slug = slug_match.group(1)
        # Text parts: [name, type, "Bouwjaar YYYY", "100,00 m x 11,40 m", "3.152 ton", "€ 1.795.000,-"]
        texts = [t.strip() for t in link.stripped_strings if t.strip()]
        if len(texts) >= 2:
            candidate = texts[1]
            # Skip if it looks like a year, price, dimension, or tonnage
            if not re.match(r"^(€|EUR|Bouwjaar|\d)", candidate) and " x " not in candidate:
                type_by_slug[slug] = candidate

    vessels = []
    for slug, data in compare_data.items():
        price_text = data.get("price", "")

        # Skip sold vessels
        if price_text and "verkocht" in price_text.lower():
            continue

        length_m, width_m = parse_dimensions(data.get("afmetingen", ""))

        vessels.append({
            "source": "pcshipbrokers",
            "source_id": slug,
            "name": data.get("name"),
            "type": type_by_slug.get(slug),
            "length_m": length_m,
            "width_m": width_m,
            "build_year": parse_build_year(data.get("year", "")),
            "tonnage": parse_tonnage(data.get("tonnage", "")),
            "price": parse_price(price_text),
            "url": f"https://pcshipbrokers.com/ships/{slug}",
            "image_url": (data.get("image") or "").replace("\\/", "/").strip() or None,
        })

    return vessels


def _fetch_detail(detail_url: str) -> dict:
    """Fetch a detail page and extract all specs + images."""
    result = {"raw_details": None, "image_urls": None}
    try:
        time.sleep(0.3)  # throttle to be polite to server
        resp = _fetch_with_retry(requests.get, detail_url)
    except requests.RequestException:
        logger.warning("Could not fetch detail page: %s", detail_url)
        return result

    soup = BeautifulSoup(resp.text, "html.parser")

    all_specs = {}

    # Parse all table rows (tr > td pairs)
    for row in soup.select("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) >= 2:
            label = cells[0].get_text(strip=True).lower()
            value = cells[1].get_text(strip=True)
            if label and value:
                all_specs[label] = value

    # Parse any definition lists
    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            label = dt.get_text(strip=True).lower()
            value = dd.get_text(strip=True)
            if label and value:
                all_specs[label] = value

    # Extract gtag event data for clean numeric fields
    for script in soup.find_all("script"):
        text = script.string or ""
        if "view_ship" in text:
            match = re.search(
                r"gtag\s*\(\s*['\"]event['\"]\s*,\s*['\"]view_ship['\"]\s*,\s*(\{[^}]+\})",
                text,
            )
            if match:
                try:
                    all_specs["_gtag"] = json.loads(match.group(1))
                except json.JSONDecodeError:
                    pass

    if all_specs:
        result["raw_details"] = all_specs

    # Extract image URLs from CDN
    image_urls = []
    for img in soup.select("img[src*='cdn.pcshipbrokers.com']"):
        src = img.get("src", "").split("?")[0]  # Strip query params for dedup
        if src and src not in image_urls:
            image_urls.append(src)

    for el in soup.select("[style*='background-image']"):
        style = el.get("style", "")
        match = re.search(r"background-image:\s*url\(['\"]?(.+?)['\"]?\)", style)
        if match:
            src = match.group(1).split("?")[0]
            if "cdn.pcshipbrokers.com" in src and src not in image_urls:
                image_urls.append(src)

    if image_urls:
        result["image_urls"] = image_urls

    return result


def scrape() -> dict:
    """Scrape PC Shipbrokers and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0, "total": 0}

    resp = _fetch_with_retry(requests.get, LISTING_URL)
    vessels = _parse_listing(resp.text)
    logger.info("Found %d vessels on listing page.", len(vessels))

    for vessel in vessels:
        if vessel["url"]:
            detail = _fetch_detail(vessel["url"])
            vessel["raw_details"] = detail["raw_details"]
            vessel["image_urls"] = detail["image_urls"]
            logger.info(
                "  %s — type: %s, specs: %d",
                vessel["name"], vessel["type"],
                len(detail["raw_details"]) if detail["raw_details"] else 0,
            )

        result = upsert_vessel(vessel)
        stats[result] += 1
        stats["total"] += 1

    return stats


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    summary = scrape()
    logger.info("PC Shipbrokers: %s", summary)
