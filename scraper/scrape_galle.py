import logging
import re
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from db import upsert_vessel
from http_utils import fetch_with_retry as _fetch_with_retry
from parsing import parse_price, parse_dimensions

logger = logging.getLogger(__name__)

URL = "https://gallemakelaars.nl/scheepsaanbod"


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
    containers = soup.select(".product-specs")
    if not containers:
        return {}

    all_specs = {}
    for container in containers:
        current_section = ""

        for node in container.descendants:
            if not hasattr(node, "name") or node.name is None:
                continue

            tag_name = node.name.lower()

            if tag_name in {"h7", "h6", "h5", "h4"}:
                raw_text = node.get_text("\n", strip=True)
                lines = [part.strip() for part in raw_text.split("\n") if part.strip()]
                current_section = lines[0].lower() if lines else ""
                if len(lines) > 1 and current_section:
                    # Text-only section: store the content after the header
                    all_specs[current_section] = " ".join(lines[1:])
                continue

            classes = node.get("class") or []
            is_row = "spec-row" in classes or tag_name == "tr"
            if not is_row:
                continue

            label_el = node.select_one(".spec-label")
            value_el = node.select_one(".spec-value")

            # Hoofdmotor rows on Galle use spec-value-1/spec-value-2
            # with an empty placeholder spec-label.
            if (not label_el or not value_el):
                alt_label_el = node.select_one(".spec-value-1")
                alt_value_el = node.select_one(".spec-value-2")
                if alt_label_el and alt_value_el:
                    label_el = alt_label_el
                    value_el = alt_value_el

            # Fallback: some templates omit class names on label/value pairs.
            if not label_el or not value_el:
                labels = node.find_all("label")
                if len(labels) >= 2:
                    label_el = labels[0]
                    value_el = labels[1]

            # Fallback: table-style rows.
            if (not label_el or not value_el) and tag_name == "tr":
                cells = node.find_all(["th", "td"], recursive=False)
                if len(cells) >= 2:
                    label_el = cells[0]
                    value_el = cells[1]

            if not label_el or not value_el:
                continue

            label = label_el.get_text(" ", strip=True).lower()
            value = value_el.get_text(" ", strip=True)
            if not label or not value:
                continue

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
    parsed_url = urlparse(detail_url)
    host = parsed_url.netloc.lower()
    path = parsed_url.path.rstrip("/")
    slug = path.split("/")[-1] if path else ""

    candidate_urls = [detail_url]
    if "gallemakelaars.nl" in host and slug:
        canonical = f"https://gallemakelaars.nl/scheepsaanbod/{slug}"
        short = f"https://gallemakelaars.nl/{slug}"
        for alt in (canonical, short):
            if alt not in candidate_urls:
                candidate_urls.append(alt)

    best_score = -1
    for url in candidate_urls:
        try:
            resp = _fetch_with_retry(requests.get, url)
        except requests.RequestException:
            logger.warning("Could not fetch detail page: %s", url)
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        all_specs = _parse_detail_specs(soup)
        image_urls = _parse_detail_images(soup)

        score = len(all_specs) + len(image_urls)
        if score <= best_score:
            continue

        best_score = score
        result["raw_details"] = all_specs or None
        result["image_urls"] = image_urls or None
        result["type"] = all_specs.get("type schip") if all_specs else None

        build_year = None
        if all_specs and all_specs.get("bouwjaar"):
            try:
                build_year = int(all_specs["bouwjaar"])
            except ValueError:
                build_year = None
        result["build_year"] = build_year
        result["tonnage"] = _parse_tonnage(all_specs)

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
