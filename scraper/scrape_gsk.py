import logging
import time

import requests

from db import upsert_vessel

logger = logging.getLogger(__name__)

GRAPHQL_URL = "https://www.gskbrokers.eu/graphql"
PAGE_SIZE = 50

QUERY = """
query GetVessels($skip: Int!, $limit: Int!) {
  getVessels(
    pagination: { skip: $skip, limit: $limit }
    sort: { field: RECENT, order: DESC }
  ) {
    totalCount
    vessels {
      id
      legacyId
      vesselName
      slug
      general {
        type
        yearOfBuild
        price
        priceVisible
        priceDropped
        status
        vesselDimensions {
          length
          width
          draft
        }
        tonnage {
          maxTonnage
        }
      }
      gallery {
        filename
      }
      technics {
        engines {
          make
          power
          powerType
          yearOfBuild
        }
      }
    }
  }
}
"""

# GSK API type enum -> Dutch vessel type
TYPE_MAP = {
    "TONS_250_399": "Motorvrachtschip",
    "TONS_400_499": "Motorvrachtschip",
    "TONS_500_749": "Motorvrachtschip",
    "TONS_750_999": "Motorvrachtschip",
    "TONS_1000_1499": "Motorvrachtschip",
    "TONS_1500": "Motorvrachtschip",
    "PUSH_BARGE": "Duwbak",
    "PUSH_BOAT": "Duw/Sleepboot",
    "TANKERS_9005_9995": "Tankschip",
    "YAUGHT": "Jacht",
    "HOUSEBOAT": "Woonschip",
    "CEMENT_TANKER": "Tankschip",
    "DUMP_BARGE": "Beunschip",
    "BARGE": "Koppelverband",
    "TUG_105_195": "Duw/Sleepboot",
    "PASSENGER_SHIP": "Passagiersschip",
    "POWDER_TANKER": "Tankschip",
    "NEWLY_BUILD": "Nieuwbouw",
}


def _fetch_with_retry(url, json_body, retries=3):
    """POST a GraphQL request with exponential-backoff retries."""
    for attempt in range(1, retries + 1):
        try:
            resp = requests.post(url, json=json_body, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            if attempt == retries:
                raise
            wait = 2 ** (attempt - 1)
            logger.warning("Attempt %d failed: %s. Retrying in %ds...", attempt, e, wait)
            time.sleep(wait)


def map_type(raw_type: str | None) -> str | None:
    """Map a GSK API type enum value to a Dutch vessel type name."""
    if raw_type is None:
        return None
    return TYPE_MAP.get(raw_type)


def build_image_url(legacy_id: str, filename: str) -> str:
    """Build an imgix image URL from a legacy ID and filename."""
    return f"https://gskbrokers.imgix.net/vessels/{legacy_id}/images/{filename}?fit=crop&w=600&h=400"


def parse_vessel(vessel: dict) -> dict | None:
    """Convert a GSK GraphQL vessel object to our vessel schema.

    Returns None if the vessel should be skipped (not FOR_SALE).
    """
    general = vessel.get("general") or {}

    if general.get("status") != "FOR_SALE":
        return None

    name = (vessel.get("vesselName") or "").strip()
    if not name:
        logger.debug("Skipping vessel with empty name (id=%s)", vessel.get("id"))
        return None

    slug = vessel.get("slug")
    legacy_id = vessel.get("legacyId")

    # Price
    price = None
    if general.get("priceVisible") and general.get("price") is not None:
        try:
            price = float(general["price"])
        except (ValueError, TypeError):
            pass

    # Dimensions
    dims = general.get("vesselDimensions") or {}
    length_m = None
    width_m = None
    if dims.get("length") is not None:
        try:
            length_m = float(dims["length"])
        except (ValueError, TypeError):
            pass
    if dims.get("width") is not None:
        try:
            width_m = float(dims["width"])
        except (ValueError, TypeError):
            pass

    # Tonnage
    tonnage = None
    tonnage_data = general.get("tonnage") or {}
    if tonnage_data.get("maxTonnage") is not None:
        try:
            tonnage = float(tonnage_data["maxTonnage"])
        except (ValueError, TypeError):
            pass

    # Build year
    build_year = general.get("yearOfBuild")
    if build_year is not None:
        try:
            build_year = int(build_year)
        except (ValueError, TypeError):
            build_year = None

    # Type
    vessel_type = map_type(general.get("type"))

    # Images
    gallery = vessel.get("gallery") or []
    image_url = None
    image_urls = None
    if gallery and legacy_id:
        image_url = build_image_url(legacy_id, gallery[0]["filename"])
        image_urls = [
            build_image_url(legacy_id, img["filename"])
            for img in gallery
            if img.get("filename")
        ]

    # Raw details: engine info, draft, original type enum
    raw_details = {}
    if dims.get("draft") is not None:
        raw_details["draft"] = dims["draft"]
    if general.get("type"):
        raw_details["gsk_type"] = general["type"]
    if general.get("priceDropped") is not None:
        raw_details["price_dropped"] = general["priceDropped"]

    technics = vessel.get("technics") or {}
    engines = technics.get("engines") or []
    if engines:
        raw_details["engines"] = [
            {k: v for k, v in eng.items() if v is not None}
            for eng in engines
        ]

    detail_url = f"https://www.gskbrokers.eu/nl/schip/{slug}" if slug else None

    return {
        "source": "gsk",
        "source_id": str(slug) if slug else str(vessel.get("id")),
        "name": name,
        "type": vessel_type,
        "length_m": length_m,
        "width_m": width_m,
        "build_year": build_year,
        "tonnage": tonnage,
        "price": price,
        "url": detail_url,
        "image_url": image_url,
        "image_urls": image_urls,
        "raw_details": raw_details or None,
    }


def scrape() -> dict:
    """Scrape GSK Brokers via GraphQL and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0, "total": 0}

    skip = 0
    total_count = None

    while True:
        logger.info("Fetching vessels skip=%d limit=%d...", skip, PAGE_SIZE)
        resp = _fetch_with_retry(GRAPHQL_URL, {
            "query": QUERY,
            "variables": {"skip": skip, "limit": PAGE_SIZE},
        })
        data = resp.json()

        get_vessels = data.get("data", {}).get("getVessels", {})
        vessels = get_vessels.get("vessels") or []
        if total_count is None:
            total_count = get_vessels.get("totalCount", 0)
            logger.info("Total vessels on GSK: %d", total_count)

        if not vessels:
            logger.info("No more vessels at skip=%d, stopping.", skip)
            break

        for v in vessels:
            parsed = parse_vessel(v)
            if parsed is None:
                continue
            result = upsert_vessel(parsed)
            stats[result] += 1
            stats["total"] += 1

        skip += PAGE_SIZE
        if skip >= total_count:
            break

    logger.info("GSK: scraped %d for-sale vessels out of %d total.", stats["total"], total_count or 0)
    return stats


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    summary = scrape()
    logger.info("GSK Brokers: %s", summary)
