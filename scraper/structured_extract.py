"""Extract comprehensive structured vessel data from raw_details using Claude Haiku.

Sends each vessel's raw listing details to Haiku for structured extraction into a
universal schema covering engines, generators, certificates, holds, tanker specs,
accommodation, and improvements.

Results are stored in the vessels table as structured_details JSONB.
Uses SHA-256 hashing to skip vessels whose raw_details haven't changed.
"""

import hashlib
import json
import logging
import os

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]

from db import supabase
from rate_limiter import call_anthropic_with_rate_limit

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are analyzing a Dutch inland vessel (binnenvaart) listing to extract comprehensive structured data.

Given the vessel's basic info and raw listing details (in Dutch), extract all available data into this JSON schema. Return ONLY valid JSON, no explanation. Use null for unknown fields. Use arrays even for single items.

{
  "shipyard": "string | null — werf / scheepswerf",
  "finishing_yard": "string | null — afbouwwerf",
  "hull_year": "number | null — casco bouwjaar (may differ from vessel build year)",
  "eni_number": "string | null — ENI / europanummer",
  "construction": "string | null — constructie: gelast, geklonken, geklonken/gelast",
  "double_hull": "boolean | null — dubbelwandig / double hull",

  "depth_m": "number | null — holte in meters",
  "airdraft_empty_m": "number | null — kruiphoogte leeg / zonder ballast",
  "airdraft_ballast_m": "number | null — kruiphoogte met ballast",
  "airdraft_lowered_m": "number | null — kruiphoogte gestreken",

  "engines": [{"make": "string", "type": "string | null", "power_hp": "number | null (convert kW * 1.36)", "year": "number | null", "hours": "number | null", "hours_date": "string | null — e.g. jan 2026", "revision_year": "number | null", "hours_since_revision": "number | null", "emission_class": "string | null — CCR1, CCR2, Stage V, EU IIIa etc."}],

  "gearboxes": [{"make": "string", "type": "string | null", "year": "number | null"}],

  "generators": [{"make": "string", "type": "string | null", "kva": "number | null", "year": "number | null", "hours": "number | null"}],

  "bow_thrusters": [{"make": "string | null", "type": "string | null", "power_hp": "number | null (convert kW * 1.36)", "year": "number | null"}],

  "propeller": "string | null — type/description of propeller",
  "nozzle": "string | null — straalbuis / nozzle type",
  "steering": "string | null — stuurinrichting / roer type",

  "certificates": [{"name": "string — e.g. CvO, scheepsattest, ADN", "valid_until": "string | null — ISO date or year", "description": "string | null"}],

  "holds": {
    "count": "number | null — aantal ruimen",
    "capacity_m3": "number | null",
    "teu": "number | null — TEU capacity",
    "dimensions": "string | null — e.g. 50.00 x 7.60 x 3.50m",
    "wall_type": "string | null — glad/gecorr",
    "floor_material": "string | null",
    "floor_thickness_mm": "number | null",
    "hatch_make": "string | null",
    "hatch_type": "string | null — e.g. stalen deksels, rolluiken",
    "hatch_year": "number | null"
  },

  "tanker": null,
  "_tanker_schema": "Only populate tanker object for tanker vessels: {tank_count, capacity_m3, coating, pipe_system, cargo_pumps, heating}",

  "fuel_capacity_l": "number | null — brandstoftank in liters",
  "freshwater_capacity_l": "number | null — drinkwatertank in liters",

  "car_crane": "string | null — auto/dekskraan",
  "spud_poles": "string | null — spudpalen",
  "anchor_winches": "string | null — ankerlier(en)",
  "wheelhouse": "string | null — stuurhuis description (hydraulisch, zinkbaar, etc.)",

  "accommodation_aft": "string | null — achterschip / woning achter",
  "accommodation_fwd": "string | null — voorschip / woning voor",
  "bedrooms": "number | null — slaapkamers",
  "airco": "boolean | null — airconditioning",

  "improvements": [{"year": "number", "description": "string — what was done"}],

  "overall_condition": "excellent | good | average | poor | unknown",
  "positive_factors": ["string — value-increasing factors"],
  "negative_factors": ["string — value-decreasing factors"]
}

Important:
- Convert kW to HP by multiplying by 1.36
- Parse Dutch dates/numbers (comma = decimal separator)
- Parse improvement lists from free text (e.g. "2020: nieuw stuurhuis")
- For tanker field: set to null for non-tankers, populate object for tankers
- Remove the _tanker_schema helper field from your output
- Empty arrays [] for fields with no data (engines, certificates, etc.)"""


def _hash_raw_details(raw_details: dict | None) -> str | None:
    """Compute SHA-256 hash of raw_details for change detection."""
    if not raw_details:
        return None
    serialized = json.dumps(raw_details, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


def _clean_raw_details(raw_details: dict) -> str:
    """Clean and truncate raw_details for the API prompt."""
    clean = {}
    for k, v in raw_details.items():
        if isinstance(k, str) and len(k) > 200:
            continue
        clean[k] = v
    text = json.dumps(clean, ensure_ascii=False, default=str)
    if len(text) > 8000:
        text = text[:8000] + "..."
    return text


def extract_structured(vessel: dict) -> dict | None:
    """Extract structured details from a single vessel using Claude Haiku.

    Returns the parsed structured dict, or None on failure.
    """
    raw = vessel.get("raw_details")
    if not raw:
        return None

    raw_str = _clean_raw_details(raw)

    price_str = f"EUR {vessel['price']:,}" if vessel.get("price") else "Prijs op aanvraag"
    vessel_info = (
        f"Name: {vessel.get('name')}\n"
        f"Type: {vessel.get('type')}\n"
        f"Build year: {vessel.get('build_year')}\n"
        f"Length: {vessel.get('length_m')}m\n"
        f"Width: {vessel.get('width_m')}m\n"
        f"Tonnage: {vessel.get('tonnage')}t\n"
        f"Price: {price_str}\n"
        f"Source: {vessel.get('source')}"
    )

    try:
        client = anthropic.Anthropic(max_retries=0)
        response = call_anthropic_with_rate_limit(
            client,
            estimated_output_tokens=1200,
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": f"{EXTRACTION_PROMPT}\n\nVessel info:\n{vessel_info}\n\nRaw listing details:\n{raw_str}",
                }
            ],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)
        # Remove helper field if present
        result.pop("_tanker_schema", None)
        return result
    except json.JSONDecodeError:
        logger.warning("JSON parse failed for %s", vessel.get("name"))
        return None
    except Exception:
        logger.exception("Structured extraction failed for %s", vessel.get("name"))
        return None


def run_extraction(vessels: list[dict]) -> dict:
    """Run structured extraction on all vessels, skipping unchanged ones.

    Writes structured_details + structured_details_hash back to DB.
    Returns summary dict with counts.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — skipping structured extraction")
        return {"extracted": 0, "skipped": 0, "errors": 0}

    extracted = 0
    skipped = 0
    errors = 0

    to_process = []
    for v in vessels:
        raw = v.get("raw_details")
        if not raw:
            skipped += 1
            continue
        new_hash = _hash_raw_details(raw)
        if new_hash and v.get("structured_details_hash") == new_hash and v.get("structured_details"):
            skipped += 1
            continue
        v["_struct_hash"] = new_hash
        to_process.append(v)

    logger.info(
        "Structured extraction: %d to process, %d skipped (unchanged)",
        len(to_process), skipped,
    )

    if not to_process:
        return {"extracted": 0, "skipped": skipped, "errors": 0}

    for v in to_process:
        structured = extract_structured(v)
        vessel_id = v.get("id")
        new_hash = v.get("_struct_hash")

        if structured is None:
            errors += 1
            continue

        try:
            supabase.table("vessels").update({
                "structured_details": structured,
                "structured_details_hash": new_hash,
            }).eq("id", vessel_id).execute()
            v["structured_details"] = structured
            extracted += 1
        except Exception:
            logger.exception("Failed to save structured details for %s", v.get("name"))
            errors += 1

    logger.info(
        "Structured extraction done: %d extracted, %d skipped, %d errors",
        extracted, skipped, errors,
    )
    return {"extracted": extracted, "skipped": skipped, "errors": errors}
