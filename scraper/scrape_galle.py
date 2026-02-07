import logging
import re
import time

import requests
from bs4 import BeautifulSoup

from db import upsert_vessel

logger = logging.getLogger(__name__)

URL = "https://gallemakelaars.nl/scheepsaanbod"


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


def parse_price(text: str):
    """Parse Galle price format like '€ 5.450.000,-' to float, or None."""
    if not text or "aanvraag" in text.lower():
        return None
    cleaned = text.replace("€", "").replace(" ", "").replace(".", "").replace(",-", "")
    cleaned = cleaned.strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_dimensions(specs_text: str):
    """Extract length and width from specs text like '110.00 x 11.45 m'."""
    match = re.search(r"([\d.,]+)\s*x\s*([\d.,]+)", specs_text)
    if not match:
        return None, None
    try:
        length = float(match.group(1).replace(",", "."))
        width = float(match.group(2).replace(",", "."))
        return length, width
    except ValueError:
        return None, None


def extract_image_url(card) -> str | None:
    """Extract background-image URL from the image div."""
    img_div = card.select_one(".cat-product-small-image .img")
    if not img_div:
        return None
    style = img_div.get("style", "")
    match = re.search(r"background-image:\s*url\(['\"]?(.+?)['\"]?\)", style)
    return match.group(1) if match else None


def _fetch_detail(detail_url: str) -> dict:
    """Fetch a vessel detail page and extract all specs + images.

    The detail page has a specs table with rows like:
        <td>type schip</td><td>Motorvrachtschip</td>
        <td>bouwjaar</td><td>2002</td>
        <td>maximaal laadvermogen</td><td>2.826 ton</td>

    Returns type, build_year, tonnage (parsed), plus raw_details (all specs)
    and image_urls (all gallery images).
    """
    result = {"type": None, "build_year": None, "tonnage": None,
              "raw_details": None, "image_urls": None}
    try:
        resp = _fetch_with_retry(requests.get, detail_url)
    except requests.RequestException:
        logger.warning("Could not fetch detail page: %s", detail_url)
        return result

    soup = BeautifulSoup(resp.text, "html.parser")

    # Capture ALL table rows as raw_details dict
    all_specs = {}
    for row in soup.select("tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        label = cells[0].get_text(strip=True).lower()
        value = cells[1].get_text(strip=True)
        if label and value:
            all_specs[label] = value

    if all_specs:
        result["raw_details"] = all_specs

    # Parse the specific fields we store as columns
    if all_specs.get("type schip"):
        result["type"] = all_specs["type schip"]

    if all_specs.get("bouwjaar"):
        try:
            result["build_year"] = int(all_specs["bouwjaar"])
        except ValueError:
            pass

    if all_specs.get("maximaal laadvermogen"):
        tonnage_str = all_specs["maximaal laadvermogen"].lower().replace("ton", "").replace(".", "").strip()
        try:
            result["tonnage"] = float(tonnage_str)
        except ValueError:
            pass

    # Extract all gallery image URLs
    image_urls = []
    for img in soup.select("img[src]"):
        src = img.get("src", "")
        if "/uploads/" in src or "/scheepsaanbod/" in src:
            if not src.startswith("http"):
                src = f"https://gallemakelaars.nl{src}"
            if src not in image_urls:
                image_urls.append(src)

    # Also check for background-image URLs in gallery divs
    for div in soup.select("[style*='background-image']"):
        style = div.get("style", "")
        match = re.search(r"background-image:\s*url\(['\"]?(.+?)['\"]?\)", style)
        if match:
            src = match.group(1)
            if not src.startswith("http"):
                src = f"https://gallemakelaars.nl{src}"
            if src not in image_urls:
                image_urls.append(src)

    if image_urls:
        result["image_urls"] = image_urls

    return result


def parse_card(card) -> dict:
    """Parse a single vessel card element."""
    name_el = card.select_one("h4")
    name = name_el.get_text(strip=True) if name_el else None

    specs_el = card.select_one(".cat-product-small-specs")
    specs_text = specs_el.get_text(strip=True) if specs_el else ""
    length, width = parse_dimensions(specs_text)

    price_el = card.select_one(".cat-product-small-price")
    price_text = price_el.get_text(strip=True) if price_el else ""
    price = parse_price(price_text)

    link_el = card.select_one("a[href]")
    detail_url = link_el["href"] if link_el else None
    if detail_url and not detail_url.startswith("http"):
        detail_url = f"https://gallemakelaars.nl{detail_url}"

    source_id = detail_url.rstrip("/").split("/")[-1] if detail_url else name

    image_url = extract_image_url(card)

    return {
        "source": "galle",
        "source_id": str(source_id),
        "name": name,
        "type": None,
        "length_m": length,
        "width_m": width,
        "build_year": None,
        "tonnage": None,
        "price": price,
        "url": detail_url,
        "image_url": image_url,
    }


def scrape() -> dict:
    """Scrape Galle makelaars and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0, "total": 0}

    resp = _fetch_with_retry(requests.get, URL)

    soup = BeautifulSoup(resp.text, "html.parser")
    cards = soup.select(".cat-product-small")
    logger.info("Found %d vessel cards.", len(cards))

    for card in cards:
        vessel = parse_card(card)

        # Fetch detail page to get type, build_year, tonnage, raw_details, image_urls
        if vessel["url"]:
            detail = _fetch_detail(vessel["url"])
            vessel["type"] = detail["type"]
            vessel["build_year"] = detail["build_year"]
            if detail["tonnage"] is not None:
                vessel["tonnage"] = detail["tonnage"]
            vessel["raw_details"] = detail["raw_details"]
            vessel["image_urls"] = detail["image_urls"]
            logger.info(
                "  %s — type: %s, build_year: %s, specs: %d",
                vessel["name"], vessel["type"], vessel["build_year"],
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
    logger.info("Galle: %s", summary)
