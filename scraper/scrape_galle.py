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
        # Sanity check: no inland vessel is wider than 25m or longer than 200m
        if width > 25:
            logger.warning("Implausible width %.2fm, discarding", width)
            width = None
        if length and length > 200:
            logger.warning("Implausible length %.2fm, discarding", length)
            length = None
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


def _parse_detail_specs(soup) -> dict:
    """Parse all specs from a detail page's .product-specs container.

    The detail page uses this HTML structure:
        <div class="product-specs">
          <h7>Algemeen</h7>
          <div class="spec-row">
            <label class="spec-label">type schip</label>
            <label class="spec-value">Motorvrachtschip</label>
          </div>
          ...
          <h7>Buikdenning
            Staal 12mm          (text-only sections embed content in h7)
          </h7>
        </div>

    Returns a dict of all specs, keyed by lowercase label.  Section headers
    are prefixed to avoid collisions (e.g. "luiken > type").
    Text-only sections are stored as "section_name" key with the text value.
    """
    container = soup.select_one(".product-specs")
    if not container:
        return {}

    all_specs = {}
    current_section = ""

    for child in container.children:
        if not hasattr(child, "name") or child.name is None:
            continue

        if child.name == "h7":
            full_text = child.get_text(strip=True)
            # Some sections embed their content directly in the h7 tag
            # e.g. <h7>Buikdenning\nStaal 12mm</h7>
            lines = [l.strip() for l in full_text.split("\n") if l.strip()]
            current_section = lines[0].lower() if lines else ""
            if len(lines) > 1:
                # Text-only section: store the content after the header
                all_specs[current_section] = " ".join(lines[1:])

        elif "spec-row" in (child.get("class") or []):
            label_el = child.select_one(".spec-label")
            value_el = child.select_one(".spec-value")
            if label_el and value_el:
                label = label_el.get_text(strip=True).lower()
                value = value_el.get_text(strip=True)
                if label and value:
                    # Prefix with section to avoid collisions
                    # (e.g. "luiken > bouwjaar" vs top-level "bouwjaar")
                    if current_section and current_section != "algemeen":
                        key = f"{current_section} > {label}"
                    else:
                        key = label
                    all_specs[key] = value

    return all_specs


def _parse_detail_images(soup) -> list[str]:
    """Extract all gallery image URLs from a detail page."""
    image_urls = []

    for img in soup.select("img[src]"):
        src = img.get("src", "")
        if "/uploads/" in src or "/scheepsaanbod/" in src:
            if not src.startswith("http"):
                src = f"https://gallemakelaars.nl{src}"
            if src not in image_urls:
                image_urls.append(src)

    for div in soup.select("[style*='background-image']"):
        style = div.get("style", "")
        match = re.search(r"background-image:\s*url\(['\"]?(.+?)['\"]?\)", style)
        if match:
            src = match.group(1)
            if not src.startswith("http"):
                src = f"https://gallemakelaars.nl{src}"
            if src not in image_urls:
                image_urls.append(src)

    return image_urls


def _parse_dutch_number(raw: str):
    """Parse a Dutch-formatted number where dot=thousands, comma=decimal.

    Handles the ambiguity when only a comma is present:
      "1.815,000" → 1815.0  (dot+comma = standard Dutch)
      "932,000"   → 932.0   (comma only, trailing zeros = decimal)
      "4,284"     → 4284.0  (comma only, non-zero fraction = thousands separator)
      "2826"      → 2826.0  (no separators)
    """
    cleaned = raw.lower().replace("ton", "").strip()
    if not cleaned:
        return None

    has_dot = "." in cleaned
    has_comma = "," in cleaned

    if has_dot and has_comma:
        # Standard Dutch: "1.815,000" → remove dots, comma→dot
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif has_comma:
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) == 3 and parts[1] != "000":
            # "4,284" → comma is thousands separator → 4284
            cleaned = cleaned.replace(",", "")
        else:
            # "932,000" → comma is decimal → 932.0
            cleaned = cleaned.replace(",", ".")
    elif has_dot:
        # Only dot: "2.826" → thousands separator → 2826
        cleaned = cleaned.replace(".", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_tonnage(specs: dict):
    """Extract tonnage from specs, trying 'maximum diepgang (t)' first."""
    for key in ("maximum diepgang (t)", "tonnenmaat > maximum diepgang (t)",
                "maximaal laadvermogen"):
        raw = specs.get(key)
        if raw:
            result = _parse_dutch_number(raw)
            if result is not None:
                return result
    return None


def _fetch_detail(detail_url: str) -> dict:
    """Fetch a vessel detail page and extract all specs + images.

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

    all_specs = _parse_detail_specs(soup)
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

    result["tonnage"] = _parse_tonnage(all_specs)

    image_urls = _parse_detail_images(soup)
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
