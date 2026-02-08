#!/usr/bin/env python3
"""
One-time script: extract condition/renovation/certificate features from raw vessel
details using Claude API (Haiku model for cost efficiency).

Produces llm_features.csv consumed by model_llm_augmented.py.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python extract_llm_features.py

Cost estimate (~400 priced vessels with raw_details):
    ~0.3M input tokens, ~20K output tokens  =>  approx $0.10-0.15 USD with Haiku.
"""
from __future__ import annotations

import asyncio
import csv
import json
import logging
import os
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.dirname(SCRIPT_DIR)
VESSELS_RAW_PATH = os.path.join(DATA_DIR, "vessels_raw.json")
OUTPUT_CSV_PATH = os.path.join(SCRIPT_DIR, "llm_features.csv")

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
MAX_REQUESTS_PER_SECOND = 10
SEMAPHORE_LIMIT = 10  # max concurrent requests
RETRY_ATTEMPTS = 2
RETRY_DELAY_S = 2.0

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (
    "You are an expert vessel surveyor. Given JSON details of an inland "
    "waterway vessel, extract three features. Respond ONLY with a JSON "
    "object (no markdown, no explanation)."
)

USER_PROMPT_TEMPLATE = """\
Vessel raw_details (JSON):
{raw_details}

Extract these three fields:

1. condition_score (integer 1-5, where 5 = excellent):
   - Consider engine running hours, last engine revision date/year,
     overall maintenance state, age of major components (hatches, crane,
     inner bottom, generators), and any renovation remarks.
   - 5 = recently overhauled / very low hours; 1 = old, unrevisioned, high hours.

2. recent_renovation (boolean true/false):
   - true if any MAJOR work (engine revision, new inner bottom, new hatches,
     new wheelhouse, hull replating, new cargo hold) was done within the last
     5 years (i.e. year >= {cutoff_year}).

3. certificate_quality (integer 0-3):
   - 0 = no certificate info found
   - 1 = certificates present but expired or validity unknown
   - 2 = valid certificate(s) but expiring within 1 year (before {one_year_from_now})
   - 3 = valid certificate(s) with 1+ year remaining

Return ONLY:
{{"condition_score": <int>, "recent_renovation": <bool>, "certificate_quality": <int>}}
"""


def _build_user_prompt(raw_details: dict) -> str:
    """Build the user prompt for a single vessel."""
    from datetime import date, timedelta

    today = date.today()
    cutoff_year = today.year - 5
    one_year = today + timedelta(days=365)

    # Truncate raw_details to ~4000 chars to stay within token budget
    details_str = json.dumps(raw_details, default=str, ensure_ascii=False)
    if len(details_str) > 4000:
        details_str = details_str[:4000] + " ... (truncated)"

    return USER_PROMPT_TEMPLATE.format(
        raw_details=details_str,
        cutoff_year=cutoff_year,
        one_year_from_now=one_year.isoformat(),
    )


def _parse_response(text: str) -> dict | None:
    """Parse the JSON response from Claude, returning None on failure."""
    text = text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return None

    # Validate fields
    cs = obj.get("condition_score")
    rr = obj.get("recent_renovation")
    cq = obj.get("certificate_quality")

    if not isinstance(cs, int) or cs < 1 or cs > 5:
        return None
    if not isinstance(rr, bool):
        return None
    if not isinstance(cq, int) or cq < 0 or cq > 3:
        return None

    return {
        "condition_score": cs,
        "recent_renovation": rr,
        "certificate_quality": cq,
    }


async def _call_claude(client, vessel_id: str, raw_details: dict, sem: asyncio.Semaphore) -> dict | None:
    """Call Claude API for a single vessel, with retries."""
    user_prompt = _build_user_prompt(raw_details)

    for attempt in range(1, RETRY_ATTEMPTS + 1):
        async with sem:
            try:
                message = client.messages.create(
                    model="claude-3-5-haiku-latest",
                    max_tokens=100,
                    system=SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                )
                text = message.content[0].text
                result = _parse_response(text)
                if result is not None:
                    return result
                else:
                    logger.warning(
                        "Vessel %s: unparseable response (attempt %d): %s",
                        vessel_id[:8], attempt, text[:120],
                    )
            except Exception as e:
                logger.warning(
                    "Vessel %s: API error (attempt %d): %s",
                    vessel_id[:8], attempt, e,
                )

            if attempt < RETRY_ATTEMPTS:
                await asyncio.sleep(RETRY_DELAY_S)

    logger.error("Vessel %s: all attempts failed, skipping.", vessel_id[:8])
    return None


async def main_async():
    """Main async entry point."""
    try:
        import anthropic
    except ImportError:
        logger.error(
            "anthropic package not installed. Run: pip install anthropic"
        )
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("Set ANTHROPIC_API_KEY environment variable.")
        sys.exit(1)

    # Load raw vessel data
    logger.info("Loading vessels from %s", VESSELS_RAW_PATH)
    with open(VESSELS_RAW_PATH) as f:
        vessels = json.load(f)

    # Filter to priced vessels with raw_details
    candidates = [
        v for v in vessels
        if v.get("price") and v.get("raw_details") and v.get("id")
    ]
    logger.info(
        "Total vessels: %d, priced with raw_details: %d",
        len(vessels), len(candidates),
    )

    # Check for existing output (resume support)
    existing_ids = set()
    existing_rows = []
    if os.path.exists(OUTPUT_CSV_PATH):
        with open(OUTPUT_CSV_PATH, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing_ids.add(row["id"])
                existing_rows.append(row)
        logger.info("Found %d already-extracted vessels, resuming.", len(existing_ids))

    todo = [v for v in candidates if v["id"] not in existing_ids]
    logger.info("Vessels to process: %d", len(todo))

    if not todo:
        logger.info("Nothing to do.")
        return

    # Set up synchronous Anthropic client (Haiku is fast enough synchronously
    # but we use a semaphore to limit concurrency)
    client = anthropic.Anthropic(api_key=api_key)
    sem = asyncio.Semaphore(SEMAPHORE_LIMIT)

    # Rate-limit bucket: simple token bucket at MAX_REQUESTS_PER_SECOND
    results = list(existing_rows)  # carry over existing
    success = 0
    fail = 0
    t0 = time.time()

    for i, vessel in enumerate(todo):
        # Simple rate limiting: sleep to stay under max RPS
        elapsed = time.time() - t0
        expected_time = (success + fail) / MAX_REQUESTS_PER_SECOND
        if elapsed < expected_time:
            await asyncio.sleep(expected_time - elapsed)

        vid = vessel["id"]
        raw = vessel["raw_details"]

        result = await _call_claude(client, vid, raw, sem)

        if result is not None:
            row = {"id": vid, **result}
            results.append(row)
            success += 1
        else:
            fail += 1

        if (i + 1) % 50 == 0:
            logger.info(
                "Progress: %d/%d (success=%d, fail=%d)",
                i + 1, len(todo), success, fail,
            )

    # Write output
    fieldnames = ["id", "condition_score", "recent_renovation", "certificate_quality"]
    with open(OUTPUT_CSV_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in results:
            writer.writerow({
                "id": row["id"],
                "condition_score": row["condition_score"],
                "recent_renovation": row["recent_renovation"],
                "certificate_quality": row["certificate_quality"],
            })

    elapsed = time.time() - t0
    logger.info(
        "Done. Extracted %d vessels (%d failed) in %.1fs. Output: %s",
        success, fail, elapsed, OUTPUT_CSV_PATH,
    )


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
