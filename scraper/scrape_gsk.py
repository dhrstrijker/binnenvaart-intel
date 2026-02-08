import logging

import requests

from db import upsert_vessel
from http_utils import fetch_with_retry as _fetch_with_retry_base

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

# Vessel data sections to fetch (skip metadata/media: id, gallery, broker, etc.)
DETAIL_SECTIONS = {
    "description", "general", "wheelhouse", "technics", "steering",
    "equipment", "tankerDetails", "recreation", "lifestory", "passengerShip",
}

# GraphQL scalar types that need no sub-selection
SCALAR_TYPES = {"String", "Int", "Float", "Boolean", "Date", "ID", "MongoID"}

# Cache for the dynamically-built detail query
_detail_query_cache = None

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
    return _fetch_with_retry_base(requests.post, url, retries=retries, json=json_body)


def map_type(raw_type: str | None) -> str | None:
    """Map a GSK API type enum value to a Dutch vessel type name."""
    if raw_type is None:
        return None
    return TYPE_MAP.get(raw_type)


def build_image_url(legacy_id: str, filename: str) -> str:
    """Build an imgix image URL from a legacy ID and filename."""
    return f"https://gskbrokers.imgix.net/vessels/{legacy_id}/images/{filename}?fit=crop&w=600&h=400"


def _resolve_title(title_list, lang="nl"):
    """Extract a single text value from a VesselTitle list.

    VesselTitle is [{locale: "nl", value: "..."}, {locale: "en", value: "..."}].
    Prefers the requested language, falls back to first non-empty value.
    """
    if not title_list:
        return None
    if isinstance(title_list, str):
        return title_list
    for item in title_list:
        if isinstance(item, dict) and item.get("locale") == lang and item.get("value"):
            return item["value"]
    # Fallback: first non-empty value
    for item in title_list:
        if isinstance(item, dict) and item.get("value"):
            return item["value"]
    return None


def _clean_detail(obj):
    """Recursively remove None values and empty dicts/lists from detail data."""
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            v = _clean_detail(v)
            if v is not None and v != {} and v != []:
                cleaned[k] = v
        return cleaned or None
    if isinstance(obj, list):
        cleaned = [_clean_detail(item) for item in obj]
        cleaned = [item for item in cleaned if item is not None and item != {} and item != []]
        return cleaned or None
    return obj


def _resolve_titles_recursive(obj):
    """Walk the response and resolve VesselTitle arrays/objects to plain strings.

    VesselTitle looks like [{locale: "nl", value: "..."}, {locale: "en", value: "..."}]
    or a single {locale: "nl", value: "..."}.
    """
    if isinstance(obj, list):
        # Check if this list looks like a VesselTitle array
        if obj and isinstance(obj[0], dict) and "locale" in obj[0]:
            return _resolve_title(obj)
        return [_resolve_titles_recursive(item) for item in obj]
    if isinstance(obj, dict):
        # Check if this is a single VesselTitle object
        if "locale" in obj and "value" in obj and len(obj) == 2:
            return obj.get("value") or None
        return {k: _resolve_titles_recursive(v) for k, v in obj.items()}
    return obj


def _unwrap_type(type_info):
    """Unwrap NON_NULL and LIST wrappers to get the base type name and kind."""
    t = type_info
    while t and t.get("kind") in ("NON_NULL", "LIST"):
        t = t.get("ofType") or {}
    return t.get("name"), t.get("kind")


# Cache for the full schema (type_name -> fields list)
_schema_cache = None


def _fetch_full_schema():
    """Fetch the entire GraphQL schema in a single introspection call."""
    global _schema_cache
    if _schema_cache is not None:
        return _schema_cache

    logger.info("Fetching full GSK GraphQL schema...")
    query = """{
      __schema {
        types {
          name
          kind
          fields {
            name
            type {
              name kind
              ofType { name kind ofType { name kind ofType { name kind } } }
            }
          }
        }
      }
    }"""
    resp = _fetch_with_retry(GRAPHQL_URL, {"query": query}, retries=5)
    data = resp.json()
    types = (data.get("data") or {}).get("__schema", {}).get("types") or []

    _schema_cache = {}
    for t in types:
        name = t.get("name")
        if name and t.get("fields"):
            _schema_cache[name] = t["fields"]
        elif name:
            # Enum/scalar/input — store empty list to distinguish from unknown
            _schema_cache[name] = []

    logger.info("Cached %d types from schema.", len(_schema_cache))
    return _schema_cache


def _build_selection(type_name, schema, visited=None, max_depth=4):
    """Recursively build a GraphQL selection set for a type from cached schema."""
    if visited is None:
        visited = set()
    if type_name in visited or max_depth <= 0 or type_name in SCALAR_TYPES or not type_name:
        return None

    fields = schema.get(type_name) or []
    if not fields:
        return None  # Enum or unknown type — treated as leaf by caller

    visited.add(type_name)
    parts = []

    for field in fields:
        actual_type, actual_kind = _unwrap_type(field["type"])
        if actual_type in SCALAR_TYPES or actual_kind == "ENUM":
            parts.append(field["name"])
        elif actual_type in schema:
            sub = _build_selection(actual_type, schema, visited.copy(), max_depth - 1)
            if sub:
                parts.append(f'{field["name"]} {{ {sub} }}')
        # else: unknown type, skip

    visited.discard(type_name)
    return " ".join(parts) if parts else None


def _get_detail_query():
    """Build (or return cached) the full detail query via schema introspection.

    Fetches the entire schema in ONE API call, then builds the query
    from the cached type definitions — no per-type requests needed.
    """
    global _detail_query_cache
    if _detail_query_cache:
        return _detail_query_cache

    schema = _fetch_full_schema()
    vessel_fields = schema.get("Vessel") or []

    parts = []
    for field in vessel_fields:
        if field["name"] not in DETAIL_SECTIONS:
            continue

        actual_type, actual_kind = _unwrap_type(field["type"])

        if actual_type in SCALAR_TYPES or actual_kind == "ENUM":
            parts.append(field["name"])
        else:
            sub = _build_selection(actual_type, schema, set(), max_depth=4)
            if sub:
                parts.append(f'{field["name"]} {{ {sub} }}')
            else:
                parts.append(field["name"])

    selection = "\n    ".join(parts)
    _detail_query_cache = (
        "query GetVesselBySlug($slug: String!) {\n"
        "  getVesselBySlug(slug: $slug) {\n"
        f"    {selection}\n"
        "  }\n"
        "}"
    )
    logger.info("Built detail query with %d sections.", len(parts))
    return _detail_query_cache


def _fetch_detail(slug: str) -> dict | None:
    """Fetch full vessel details via dynamically-built GraphQL query.

    Introspects the schema once to build a query covering ALL fields,
    then resolves VesselTitle objects and cleans nulls/empties.
    """
    query = _get_detail_query()
    try:
        resp = _fetch_with_retry(GRAPHQL_URL, {
            "query": query,
            "variables": {"slug": slug},
        })
    except requests.RequestException:
        logger.warning("Could not fetch detail for slug: %s", slug)
        return None

    data = resp.json()
    vessel_data = (data.get("data") or {}).get("getVesselBySlug")
    if not vessel_data:
        logger.warning("No detail data returned for slug: %s", slug)
        return None

    resolved = _resolve_titles_recursive(vessel_data)
    return _clean_detail(resolved)


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

            # Fetch detail page for comprehensive raw_details
            slug = v.get("slug")
            if slug:
                detail_specs = _fetch_detail(slug)
                if detail_specs:
                    # Merge detail specs into raw_details (detail takes precedence)
                    existing_raw = parsed.get("raw_details") or {}
                    existing_raw.update(detail_specs)
                    parsed["raw_details"] = existing_raw
                    logger.info(
                        "  %s — specs: %d keys",
                        parsed["name"], len(detail_specs),
                    )

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
