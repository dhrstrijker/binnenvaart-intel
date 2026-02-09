import logging
import re
import time

import requests
from bs4 import BeautifulSoup

from db import upsert_vessel
from http_utils import fetch_with_retry as _fetch_with_retry

logger = logging.getLogger(__name__)

BASE_URL = "https://www.gtsschepen.nl/schepen/"
MAX_PAGES = 20


def parse_price(text: str):
    """Parse price like '€ 395.000,-' to float."""
    if not text:
        return None
    text = text.strip()
    if "notk" in text.lower() or "n.o.t.k" in text.lower():
        return None
    cleaned = (
        text.replace("€", "").replace(" ", "")
        .replace(".", "").replace(",-", "").strip()
    )
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_dimensions(text: str):
    """Parse dimensions like '80.14m x 8.21m' or '80,14 m x 8,21 m' to (length, width)."""
    if not text:
        return None, None
    match = re.search(r"([\d.,]+)\s*m?\s*x\s*([\d.,]+)", text)
    if not match:
        return None, None
    try:
        length = float(match.group(1).replace(",", "."))
        width = float(match.group(2).replace(",", "."))
        return length, width
    except ValueError:
        return None, None


def parse_tonnage(text: str):
    """Parse tonnage like '1128 ton' or '1.128 t' to float."""
    if not text:
        return None
    cleaned = text.lower().replace("ton", "").replace("t", "").replace(".", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_build_year(text: str):
    """Parse build year from text like 'Bouwjr 1960' or '| Bouwjr 1960'."""
    if not text:
        return None
    match = re.search(r"(\d{4})", text)
    return int(match.group(1)) if match else None


def parse_card(card) -> dict | None:
    """Parse a single vessel card from the GTS listing page.

    Returns None for sold vessels.
    """
    # Check status label for sold vessels
    label_el = card.select_one(".item-label")
    is_sold = bool(label_el and "verkocht" in label_el.get_text(strip=True).lower())

    # Name and URL
    name_link = card.select_one("h3 a")
    if not name_link:
        return None
    name = name_link.get_text(strip=True)
    detail_url = name_link.get("href", "")
    if detail_url and not detail_url.startswith("http"):
        detail_url = f"https://www.gtsschepen.nl{detail_url}"

    # Source ID from URL slug
    source_id = detail_url.rstrip("/").split("/")[-1] if detail_url else name

    # Price
    price_el = card.select_one(".item-content p strong")
    price_text = price_el.get_text(strip=True) if price_el else ""
    price = parse_price(price_text)

    # Specs: type, tonnage, dimensions, build year from second <p> in .item-content
    vessel_type = None
    tonnage = None
    length_m = None
    width_m = None
    build_year = None

    content = card.select_one(".item-content")
    if content:
        paragraphs = content.find_all("p")
        # The second <p> contains specs separated by <br>
        if len(paragraphs) >= 2:
            specs_p = paragraphs[1]
            # Get text parts split by <br>
            parts = []
            for child in specs_p.children:
                if isinstance(child, str):
                    text = child.strip()
                    if text:
                        parts.append(text)
                elif child.name == "br":
                    continue
                else:
                    text = child.get_text(strip=True)
                    if text:
                        parts.append(text)

            for part in parts:
                part = part.strip().strip("|").strip()
                if not part:
                    continue
                if " x " in part or re.match(r"[\d.,]+\s*m?\s*x\s*[\d.,]+", part):
                    length_m, width_m = parse_dimensions(part)
                elif "ton" in part.lower() or re.match(r"^\d+\s*t$", part.lower()):
                    tonnage = parse_tonnage(part)
                elif "bouwj" in part.lower():
                    build_year = parse_build_year(part)
                elif not vessel_type:
                    # First unrecognized text is the type
                    vessel_type = part

    # Image from background-image style
    image_url = None
    img_div = card.select_one(".item-image")
    if img_div:
        style = img_div.get("style", "")
        match = re.search(r"background-image:\s*url\(['\"]?(.+?)['\"]?\)", style)
        if match:
            image_url = match.group(1).strip()

    return {
        "source": "gtsschepen",
        "source_id": source_id,
        "name": name,
        "type": vessel_type,
        "length_m": length_m,
        "width_m": width_m,
        "build_year": build_year,
        "tonnage": tonnage,
        "price": price,
        "url": detail_url,
        "image_url": image_url,
        "is_sold": is_sold,
    }


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

    # Parse all data-row elements: .row-label + .row-info
    all_specs = {}
    current_section = ""
    for el in soup.select("h2, .data-row"):
        if el.name == "h2":
            current_section = el.get_text(strip=True).lower()
            continue

        label_el = el.select_one(".row-label")
        value_el = el.select_one(".row-info")
        if label_el and value_el:
            label = label_el.get_text(strip=True).lower()
            value = value_el.get_text(strip=True)
            if label and value:
                # Prefix with section for context when labels repeat across sections
                key = f"{current_section} - {label}" if current_section else label
                all_specs[key] = value

    if all_specs:
        result["raw_details"] = all_specs

    # Extract images from swiper-slide background-images
    image_urls = []
    for slide in soup.select(".swiper-slide[style*='background-image']"):
        style = slide.get("style", "")
        match = re.search(r"background-image:\s*url\(['\"]?(.+?)['\"]?\)", style)
        if match:
            src = match.group(1)
            if not src.startswith("http"):
                src = f"https://www.gtsschepen.nl{src}"
            if src not in image_urls:
                image_urls.append(src)

    if image_urls:
        result["image_urls"] = image_urls

    return result


def _enrich_from_details(vessel: dict, specs: dict) -> None:
    """Fill in missing tonnage and build_year from detail page specs."""
    if not vessel.get("tonnage"):
        tonnage_keys = [
            k for k in specs if "tonnenmaat" in k
        ]
        tonnage_values = []
        for k in tonnage_keys:
            t = parse_tonnage(specs[k])
            if t:
                tonnage_values.append(t)
        if tonnage_values:
            vessel["tonnage"] = max(tonnage_values)

    if not vessel.get("build_year"):
        raw_year = specs.get("algemene gegevens - bouwjaar")
        if raw_year:
            vessel["build_year"] = parse_build_year(raw_year)


def scrape() -> dict:
    """Scrape GTS Schepen and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0, "total": 0}

    page = 1
    while page <= MAX_PAGES:
        url = BASE_URL if page == 1 else f"{BASE_URL}page/{page}/"
        logger.info("Fetching page %d...", page)

        try:
            resp = _fetch_with_retry(requests.get, url)
        except requests.RequestException:
            logger.warning("Failed to fetch page %d, stopping.", page)
            break

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select(".grid-item")

        if not cards:
            logger.info("Page %d returned 0 cards, stopping.", page)
            break

        for card in cards:
            vessel = parse_card(card)
            if vessel is None:
                continue  # Missing name/link, skip

            # Fetch detail page for raw_details and image_urls
            if vessel["url"]:
                detail = _fetch_detail(vessel["url"])
                vessel["raw_details"] = detail["raw_details"]
                vessel["image_urls"] = detail["image_urls"]

                # Fill in missing fields from detail page specs
                if detail["raw_details"]:
                    _enrich_from_details(vessel, detail["raw_details"])

                logger.info(
                    "  %s — type: %s, specs: %d",
                    vessel["name"], vessel["type"],
                    len(detail["raw_details"]) if detail["raw_details"] else 0,
                )

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
    logger.info("GTS Schepen: %s", summary)
