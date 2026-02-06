import re

import requests

from db import upsert_vessel

API_URL = "https://api.rensendriessen.com/api/public/ships/brokers/list/filter/"
TOTAL_PAGES = 7


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

    return {
        "source": "rensendriessen",
        "source_id": str(ship_id),
        "name": ship.get("shipname"),
        "type": ship.get("ship_type"),
        "length_m": parse_dimension(ship.get("ship_length")),
        "width_m": parse_dimension(ship.get("ship_width")),
        "build_year": ship.get("build_year"),
        "price": price,
        "url": f"https://rensendriessen.com/aanbod/{ship_id}",
        "image_url": image_url,
    }


def scrape() -> dict:
    """Scrape all pages and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "total": 0}

    for page in range(1, TOTAL_PAGES + 1):
        resp = requests.post(API_URL, json={"page": page}, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        ships = data if isinstance(data, list) else data.get("results", data.get("data", []))

        for ship in ships:
            vessel = parse_vessel(ship)
            result = upsert_vessel(vessel)
            stats[result] += 1
            stats["total"] += 1

    return stats


if __name__ == "__main__":
    summary = scrape()
    print(f"RensenDriessen: {summary}")
