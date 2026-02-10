"""Extract structured vessel condition signals from raw_details using Claude Haiku.

Sends each vessel's raw listing details to Haiku for structured extraction of
engine specs, certifications, renovation history, and value factors.
Results are stored in the vessels table as condition_signals JSONB.

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

EXTRACTION_PROMPT = """You are analyzing a Dutch inland vessel listing to extract condition signals that affect its market value.

Given the vessel's basic info and raw listing details (in Dutch), extract these structured signals. Return ONLY valid JSON, no explanation.

{
  "engine_hp": <number or null - main engine horsepower (convert kW to HP: multiply by 1.36)>,
  "engine_year": <number or null - year the current main engine was built/installed>,
  "engine_hours": <number or null - main engine running hours>,
  "engine_brand": <string or null - engine manufacturer e.g. "Caterpillar", "Volvo Penta", "Mitsubishi">,
  "double_hull": <boolean or null - dubbelwandig/double hull mentioned>,
  "cert_expiry_year": <number or null - year the main certificate (CvO/scheepsattest) expires>,
  "renovation_year": <number or null - most recent major renovation/rebuild year>,
  "overall_condition": <string: "excellent"|"good"|"average"|"poor"|"unknown" - overall assessment based on all signals>,
  "value_factors_positive": <list of strings - factors that would increase value, e.g. "new engine 2020", "double hull", "full renovation 2023", "low engine hours">,
  "value_factors_negative": <list of strings - factors that decrease value, e.g. "high engine hours", "old engine", "no certificates", "steel concerns">
}"""


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
    if len(text) > 4000:
        text = text[:4000] + "..."
    return text


def extract_signals(vessel: dict) -> dict | None:
    """Extract condition signals from a single vessel using Claude Haiku.

    Returns the parsed signals dict, or None on failure.
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
            estimated_output_tokens=400,
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
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
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("JSON parse failed for %s", vessel.get("name"))
        return None
    except Exception:
        logger.exception("Haiku extraction failed for %s", vessel.get("name"))
        return None


def run_extraction(vessels: list[dict]) -> dict:
    """Run condition signal extraction on all vessels, skipping unchanged ones.

    Writes condition_signals + condition_signals_hash back to DB.
    Returns summary dict with counts.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — skipping condition extraction")
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
        if new_hash and v.get("condition_signals_hash") == new_hash and v.get("condition_signals"):
            skipped += 1
            continue
        v["_new_hash"] = new_hash
        to_process.append(v)

    logger.info(
        "Condition extraction: %d to process, %d skipped (unchanged)",
        len(to_process), skipped,
    )

    if not to_process:
        return {"extracted": 0, "skipped": skipped, "errors": 0}

    for v in to_process:
        signals = extract_signals(v)
        vessel_id = v.get("id")
        new_hash = v.get("_new_hash")

        if signals is None:
            errors += 1
            continue

        try:
            supabase.table("vessels").update({
                "condition_signals": signals,
                "condition_signals_hash": new_hash,
            }).eq("id", vessel_id).execute()
            v["condition_signals"] = signals
            extracted += 1
        except Exception:
            logger.exception("Failed to save signals for %s", v.get("name"))
            errors += 1

    logger.info(
        "Condition extraction done: %d extracted, %d skipped, %d errors",
        extracted, skipped, errors,
    )
    return {"extracted": extracted, "skipped": skipped, "errors": errors}
