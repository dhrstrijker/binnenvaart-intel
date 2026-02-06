import re
from typing import Optional

import requests
from bs4 import BeautifulSoup

from db import upsert_vessel

URL = "https://gallemakelaars.nl/scheepsaanbod"


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


def extract_image_url(card) -> Optional[str]:
    """Extract background-image URL from the image div."""
    img_div = card.select_one(".cat-product-small-image .img")
    if not img_div:
        return None
    style = img_div.get("style", "")
    match = re.search(r"background-image:\s*url\(['\"]?(.+?)['\"]?\)", style)
    return match.group(1) if match else None


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
        "price": price,
        "url": detail_url,
        "image_url": image_url,
    }


def scrape() -> dict:
    """Scrape Galle makelaars and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "total": 0}

    resp = requests.get(URL, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    cards = soup.select(".cat-product-small")

    for card in cards:
        vessel = parse_card(card)
        result = upsert_vessel(vessel)
        stats[result] += 1
        stats["total"] += 1

    return stats


if __name__ == "__main__":
    summary = scrape()
    print(f"Galle: {summary}")
