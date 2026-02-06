"""One-time import of historical Browse.ai price data into Supabase.

Fetches weekly snapshots from 4 Browse.ai robots (Oct 2025 - Feb 2026)
and backfills price_history + first_seen_at for existing and new vessels.

Usage:
    python import_browseai.py              # Live import
    python import_browseai.py --dry-run    # Preview without writing to DB
"""

import argparse
import logging
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supabase client (same setup as db.py)
# ---------------------------------------------------------------------------
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# ---------------------------------------------------------------------------
# Browse.ai config
# ---------------------------------------------------------------------------
BROWSE_AI_API_KEY = os.environ["BROWSE_AI_API_KEY"]
BROWSE_AI_BASE = "https://api.browse.ai/v2"

ROBOTS = {
    "rensen": {
        "robot_id": "0199c851-2740-7e64-8a92-e9b845be3066",
        "list_keys": ["Vessels for Sale"],
        "source": "rensendriessen",
    },
    "gsk": {
        "robot_id": "0199c8ae-483f-7625-a77a-c0a1195158be",
        "list_keys": ["Vessels for Sale"],
        "source": "gsk",
    },
    "pcshipbrokers": {
        "robot_id": "0199c8b4-176c-716f-b47c-535633d63fe1",
        "list_keys": ["Vessels for Sale"],
        "source": "pcshipbrokers",
    },
    "gts": {
        "robot_id": "0199c8dd-e831-7336-8092-71a6881c7efd",
        "list_keys": ["Ships List", "Vessels for Sale"],
        "source": "gtsschepen",
    },
}


# ---------------------------------------------------------------------------
# Price parsing
# ---------------------------------------------------------------------------
def parse_price(raw: str | None) -> float | None:
    """Parse price from various broker text formats.

    Handles:
        "Price: \u20ac 5.150.000,-"  -> 5150000.0
        "\u20ac\\xa02.000.000,00"    -> 2000000.0
        "\u20ac 895.000,-"           -> 895000.0
        "\u20ac 525.000,00"          -> 525000.0
        "Price: To be agreed"      -> None
        "Prijs op aanvraag"        -> None
        "N.O.T.K."                 -> None
        "" or None                 -> None
    """
    if not raw:
        return None

    text = raw.strip()

    # Known "no price" phrases
    no_price = ("to be agreed", "prijs op aanvraag", "n.o.t.k.", "op aanvraag",
                "in overleg", "price on request")
    if text.lower() in no_price:
        return None

    # Strip "Price:" prefix and currency symbol / non-breaking spaces
    text = re.sub(r"^price:\s*", "", text, flags=re.IGNORECASE)
    text = text.replace("\u20ac", "").replace("\xa0", " ").replace(",-", "").strip()

    if not text or text == "-":
        return None

    # Dutch number format: 1.234.567,89 -> 1234567.89
    # Remove dots (thousands separator), replace comma with dot (decimal)
    text = text.replace(".", "").replace(",", ".")

    # Extract the numeric part
    match = re.search(r"[\d]+(?:\.[\d]+)?", text)
    if not match:
        return None

    try:
        return float(match.group())
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Source-ID extraction
# ---------------------------------------------------------------------------
def extract_source_id_rensen(url: str | None) -> str | None:
    """Extract source_id from Rensen URL: ?id=1784 -> '1784'."""
    if not url:
        return None
    match = re.search(r"[?&]id=(\d+)", url)
    return match.group(1) if match else None


def extract_source_id_slug(url: str | None) -> str | None:
    """Extract slug from URL path: /schip/majesty -> 'majesty'."""
    if not url:
        return None
    # Remove trailing slash, take last segment
    path = url.rstrip("/").split("/")[-1]
    # Remove query params if present
    path = path.split("?")[0]
    return path if path else None


# ---------------------------------------------------------------------------
# Per-robot vessel parsing
# ---------------------------------------------------------------------------
def parse_rensen_vessel(item: dict, snapshot_dt: str) -> dict | None:
    """Parse a Rensen Browse.ai vessel record.

    Two field schemas exist (robot was reconfigured):
      Old: Name, Type, Dimensions, Price, Image Url, Url
      New: Vessel Type and Dimensions, Price, Details Link, Vessel Image
    REMOVED vessels have null fields (skip them).
    """
    if item.get("_STATUS") == "REMOVED":
        return None

    # Handle both old and new field names for URL
    url = item.get("Details Link") or item.get("Url")
    source_id = extract_source_id_rensen(url)
    if not source_id:
        return None

    vessel_type = None
    length_m = None
    width_m = None
    name = None

    # New schema: combined "Vessel Type and Dimensions" field
    type_dims = item.get("Vessel Type and Dimensions") or ""
    if type_dims:
        parts = type_dims.split(" - ", 1)
        if parts:
            vessel_type = parts[0].strip().title() or None
        if len(parts) > 1:
            dims_match = re.match(r"([\d.,]+)\s*M?\s*X\s*([\d.,]+)", parts[1], re.IGNORECASE)
            if dims_match:
                try:
                    length_m = float(dims_match.group(1).replace(",", "."))
                    width_m = float(dims_match.group(2).replace(",", "."))
                except ValueError:
                    pass
    else:
        # Old schema: separate fields
        name = (item.get("Name") or "").strip() or None
        vessel_type = (item.get("Type") or "").strip().title() or None
        dims = item.get("Dimensions") or ""
        dims_match = re.match(r"([\d.,]+)\s*M?\s*X\s*([\d.,]+)", dims, re.IGNORECASE)
        if dims_match:
            try:
                length_m = float(dims_match.group(1).replace(",", "."))
                width_m = float(dims_match.group(2).replace(",", "."))
            except ValueError:
                pass

    image_url = item.get("Vessel Image") or item.get("Image Url")

    return {
        "name": name,
        "source": "rensendriessen",
        "source_id": source_id,
        "price": parse_price(item.get("Price")),
        "type": vessel_type,
        "length_m": length_m,
        "width_m": width_m,
        "url": url,
        "image_url": image_url,
        "first_seen_at": snapshot_dt,
        "scraped_at": snapshot_dt,
    }


def parse_gsk_vessel(item: dict, snapshot_dt: str) -> dict | None:
    """Parse a GSK Browse.ai vessel record."""
    if item.get("_STATUS") == "REMOVED":
        return None
    url = item.get("url")
    source_id = extract_source_id_slug(url)
    if not source_id:
        return None

    # Parse dimensions from "110m x 9.5m"
    length_m = None
    width_m = None
    dims = item.get("Dimensies") or ""
    dims_match = re.match(r"([\d.,]+)\s*m?\s*x\s*([\d.,]+)", dims, re.IGNORECASE)
    if dims_match:
        try:
            length_m = float(dims_match.group(1).replace(",", "."))
            width_m = float(dims_match.group(2).replace(",", "."))
        except ValueError:
            pass

    # Parse tonnage and build year from "2234 ton\n1982"
    tonnage = None
    build_year = None
    tb = item.get("Tonnage en bouwjaar") or ""
    tb_match = re.match(r"([\d.,]+)\s*ton\s*\n?\s*(\d{4})", tb, re.IGNORECASE)
    if tb_match:
        try:
            tonnage = float(tb_match.group(1).replace(",", "."))
        except ValueError:
            pass
        try:
            build_year = int(tb_match.group(2))
        except ValueError:
            pass

    return {
        "name": (item.get("Scheepsnaam") or "").strip() or None,
        "source": "gsk",
        "source_id": source_id,
        "price": parse_price(item.get("Prijs")),
        "length_m": length_m,
        "width_m": width_m,
        "tonnage": tonnage,
        "build_year": build_year,
        "url": url,
        "image_url": item.get("foto"),
        "first_seen_at": snapshot_dt,
        "scraped_at": snapshot_dt,
    }


def parse_pcshipbrokers_vessel(item: dict, snapshot_dt: str) -> dict | None:
    """Parse a PC Shipbrokers Browse.ai vessel record."""
    if item.get("_STATUS") == "REMOVED":
        return None
    url = item.get("Ship URL")
    source_id = extract_source_id_slug(url)
    if not source_id:
        return None

    # Parse dimensions from "93,89 m x 9,50 m"
    length_m = None
    width_m = None
    dims = item.get("Dimensions") or ""
    dims_match = re.match(r"([\d.,]+)\s*m?\s*x\s*([\d.,]+)", dims, re.IGNORECASE)
    if dims_match:
        try:
            length_m = float(dims_match.group(1).replace(",", "."))
            width_m = float(dims_match.group(2).replace(",", "."))
        except ValueError:
            pass

    # Parse tonnage from "1.804 ton"
    tonnage = None
    weight = item.get("Weight") or ""
    weight_match = re.match(r"([\d.]+)\s*ton", weight, re.IGNORECASE)
    if weight_match:
        try:
            tonnage = float(weight_match.group(1).replace(".", ""))
        except ValueError:
            pass

    # Parse build year from "Bouwjaar 1957"
    build_year = None
    yb = item.get("Year Built") or ""
    yb_match = re.search(r"(\d{4})", yb)
    if yb_match:
        try:
            build_year = int(yb_match.group(1))
        except ValueError:
            pass

    return {
        "name": (item.get("Ship Name") or "").strip() or None,
        "source": "pcshipbrokers",
        "source_id": source_id,
        "price": parse_price(item.get("Price")),
        "type": (item.get("Ship Type") or "").strip() or None,
        "length_m": length_m,
        "width_m": width_m,
        "tonnage": tonnage,
        "build_year": build_year,
        "url": url,
        "image_url": item.get("Image URL"),
        "first_seen_at": snapshot_dt,
        "scraped_at": snapshot_dt,
    }


def parse_gts_vessel(item: dict, snapshot_dt: str) -> dict | None:
    """Parse a GTS Browse.ai vessel record. No separate price field.

    Two field schemas exist (robot was reconfigured):
      Old: scheepsnaam, prijs, specs, foto, url (list key: "Vessels for Sale")
      New: Ship Name, Specifications, Image URL, Ship Link (list key: "Ships List")
    """
    if item.get("_STATUS") == "REMOVED":
        return None

    # Handle both old and new field names
    url = item.get("url") or item.get("Ship Link")
    source_id = extract_source_id_slug(url)
    if not source_id:
        return None

    # Specs field differs between schemas
    specs = (item.get("specs") or item.get("Specifications") or "").replace("\xa0", " ")
    ship_type = None
    tonnage = None
    build_year = None
    length_m = None
    width_m = None

    lines = specs.split("\n")
    if lines:
        ship_type = lines[0].strip() or None

    ton_match = re.search(r"([\d.]+)\s*ton", specs, re.IGNORECASE)
    if ton_match:
        try:
            tonnage = float(ton_match.group(1).replace(".", ""))
        except ValueError:
            pass

    year_match = re.search(r"Bouwjr?\s*\.?\s*(\d{4})", specs, re.IGNORECASE)
    if year_match:
        try:
            build_year = int(year_match.group(1))
        except ValueError:
            pass

    dims_match = re.search(r"([\d.,]+)\s*m?\s*x\s*([\d.,]+)", specs, re.IGNORECASE)
    if dims_match:
        try:
            length_m = float(dims_match.group(1).replace(",", "."))
            width_m = float(dims_match.group(2).replace(",", "."))
        except ValueError:
            pass

    name = (item.get("scheepsnaam") or item.get("Ship Name") or "").strip() or None
    image_url = item.get("foto") or item.get("Image URL")

    return {
        "name": name,
        "source": "gtsschepen",
        "source_id": source_id,
        "price": None,  # GTS has no usable price field in Browse.ai
        "type": ship_type,
        "length_m": length_m,
        "width_m": width_m,
        "tonnage": tonnage,
        "build_year": build_year,
        "url": url,
        "image_url": image_url,
        "first_seen_at": snapshot_dt,
        "scraped_at": snapshot_dt,
    }


PARSERS = {
    "rensen": parse_rensen_vessel,
    "gsk": parse_gsk_vessel,
    "pcshipbrokers": parse_pcshipbrokers_vessel,
    "gts": parse_gts_vessel,
}


# ---------------------------------------------------------------------------
# Browse.ai API
# ---------------------------------------------------------------------------
def fetch_all_tasks(robot_id: str) -> list[dict]:
    """Fetch all tasks for a robot, paginating through results.

    Filters to only successful tasks client-side since the API returns all.
    Response is nested under result.robotTasks.
    """
    headers = {"Authorization": f"Bearer {BROWSE_AI_API_KEY}"}
    all_items = []
    page = 1

    while True:
        url = f"{BROWSE_AI_BASE}/robots/{robot_id}/tasks?pageSize=10&page={page}"
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        robot_tasks = data.get("result", {}).get("robotTasks", {})
        items = robot_tasks.get("items", [])
        if not items:
            break

        # Filter to successful tasks only
        successful = [t for t in items if t.get("status") == "successful"]
        all_items.extend(successful)

        total = robot_tasks.get("totalCount", 0)
        logger.debug("  Page %d: got %d items (%d successful, total: %d)",
                      page, len(items), len(successful), total)

        if len(all_items) >= total:
            break

        # Check hasMore flag
        if not robot_tasks.get("hasMore", False):
            break

        page += 1
        time.sleep(0.5)

    return all_items


def dedup_tasks_by_date(tasks: list[dict]) -> list[dict]:
    """Keep only one task per calendar date (first occurrence after sorting by time)."""
    seen_dates: set[str] = set()
    deduped = []
    for task in tasks:
        finished_ms = task.get("finishedAt", 0)
        dt = datetime.fromtimestamp(finished_ms / 1000, tz=timezone.utc)
        date_key = dt.strftime("%Y-%m-%d")
        if date_key not in seen_dates:
            seen_dates.add(date_key)
            deduped.append(task)
    return deduped


# ---------------------------------------------------------------------------
# Import logic
# ---------------------------------------------------------------------------
def process_snapshot(
    robot_name: str,
    robot_cfg: dict,
    task: dict,
    dry_run: bool,
    stats: dict,
) -> None:
    """Process a single Browse.ai task snapshot."""
    finished_ms = task.get("finishedAt", 0)
    snapshot_dt_obj = datetime.fromtimestamp(finished_ms / 1000, tz=timezone.utc)
    snapshot_dt = snapshot_dt_obj.isoformat()

    captured = task.get("capturedLists", {})
    # Try each list key until we find vessels
    vessels_raw = []
    for lk in robot_cfg["list_keys"]:
        vessels_raw = captured.get(lk, [])
        if vessels_raw:
            break

    parser = PARSERS[robot_name]
    source = robot_cfg["source"]
    is_gts = robot_name == "gts"

    for raw_vessel in vessels_raw:
        vessel = parser(raw_vessel, snapshot_dt)
        if vessel is None:
            stats["skipped"] += 1
            continue

        source_id = vessel["source_id"]

        if dry_run:
            stats["processed"] += 1
            if vessel.get("price") is not None:
                stats["prices_found"] += 1
            continue

        # Look up existing vessel
        try:
            existing = (
                supabase.table("vessels")
                .select("id, price, first_seen_at")
                .eq("source", source)
                .eq("source_id", source_id)
                .execute()
            )
        except Exception:
            logger.exception("Failed to query vessel %s/%s", source, source_id)
            stats["errors"] += 1
            continue

        if not existing.data:
            # Insert new vessel
            try:
                row = supabase.table("vessels").insert(vessel).execute()
                vessel_id = row.data[0]["id"]
                stats["inserted"] += 1

                # Insert initial price_history if price exists (not for GTS)
                if vessel.get("price") is not None and not is_gts:
                    supabase.table("price_history").insert({
                        "vessel_id": vessel_id,
                        "price": vessel["price"],
                        "recorded_at": snapshot_dt,
                    }).execute()
                    stats["price_records"] += 1
            except Exception:
                logger.exception("Failed to insert vessel %s/%s", source, source_id)
                stats["errors"] += 1
            continue

        # Vessel exists
        vessel_id = existing.data[0]["id"]
        existing_first_seen = existing.data[0].get("first_seen_at")

        # Update first_seen_at if this snapshot is older
        if existing_first_seen:
            try:
                existing_dt = datetime.fromisoformat(existing_first_seen.replace("Z", "+00:00"))
                if snapshot_dt_obj < existing_dt:
                    supabase.table("vessels").update(
                        {"first_seen_at": snapshot_dt}
                    ).eq("id", vessel_id).execute()
                    stats["first_seen_updated"] += 1
            except (ValueError, TypeError):
                pass

        # Insert price_history if price exists and differs (skip GTS)
        if vessel.get("price") is not None and not is_gts:
            try:
                # Check if a record already exists at this exact timestamp
                dup_check = (
                    supabase.table("price_history")
                    .select("id")
                    .eq("vessel_id", vessel_id)
                    .eq("recorded_at", snapshot_dt)
                    .execute()
                )
                if dup_check.data:
                    stats["processed"] += 1
                    continue

                # Check last recorded price before this snapshot
                last_price_resp = (
                    supabase.table("price_history")
                    .select("price")
                    .eq("vessel_id", vessel_id)
                    .lt("recorded_at", snapshot_dt)
                    .order("recorded_at", desc=True)
                    .limit(1)
                    .execute()
                )
                last_price = last_price_resp.data[0]["price"] if last_price_resp.data else None

                if last_price != vessel["price"]:
                    supabase.table("price_history").insert({
                        "vessel_id": vessel_id,
                        "price": vessel["price"],
                        "recorded_at": snapshot_dt,
                    }).execute()
                    stats["price_records"] += 1
            except Exception:
                logger.exception("Failed to insert price_history for %s/%s", source, source_id)
                stats["errors"] += 1

        stats["processed"] += 1


def run_import(dry_run: bool = False) -> None:
    """Main import entry point."""
    mode = "DRY RUN" if dry_run else "LIVE"
    logger.info("=== Browse.ai Historical Import (%s) ===", mode)

    grand_stats = defaultdict(int)

    for robot_name, robot_cfg in ROBOTS.items():
        robot_id = robot_cfg["robot_id"]
        logger.info("--- Fetching tasks for %s (robot %s) ---", robot_name, robot_id)

        tasks = fetch_all_tasks(robot_id)
        logger.info("  Fetched %d successful tasks", len(tasks))

        # Sort by finishedAt ascending (oldest first)
        tasks.sort(key=lambda t: t.get("finishedAt", 0))

        # Deduplicate: keep one task per calendar date
        tasks = dedup_tasks_by_date(tasks)
        logger.info("  After dedup: %d unique date snapshots", len(tasks))

        stats = defaultdict(int)

        for i, task in enumerate(tasks, 1):
            finished_ms = task.get("finishedAt", 0)
            dt = datetime.fromtimestamp(finished_ms / 1000, tz=timezone.utc)
            date_str = dt.strftime("%Y-%m-%d %H:%M")

            captured = task.get("capturedLists", {})
            vessel_count = 0
            for lk in robot_cfg["list_keys"]:
                vessel_count = len(captured.get(lk, []))
                if vessel_count:
                    break

            logger.info(
                "  Processing %s: task %d/%d (%s) -- %d vessels",
                robot_name, i, len(tasks), date_str, vessel_count,
            )

            process_snapshot(robot_name, robot_cfg, task, dry_run, stats)

        logger.info(
            "  %s summary: processed=%d, inserted=%d, price_records=%d, "
            "first_seen_updated=%d, skipped=%d, errors=%d",
            robot_name,
            stats["processed"], stats["inserted"], stats["price_records"],
            stats["first_seen_updated"], stats["skipped"], stats["errors"],
        )

        for k, v in stats.items():
            grand_stats[k] += v

    logger.info("=== Import Complete ===")
    logger.info(
        "Grand total: processed=%d, inserted=%d, price_records=%d, "
        "first_seen_updated=%d, skipped=%d, errors=%d",
        grand_stats["processed"], grand_stats["inserted"],
        grand_stats["price_records"], grand_stats["first_seen_updated"],
        grand_stats["skipped"], grand_stats["errors"],
    )
    if dry_run:
        logger.info("Prices found (non-null): %d", grand_stats["prices_found"])
        logger.info("(Dry run -- no changes written to database)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Browse.ai historical data")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to DB")
    args = parser.parse_args()
    run_import(dry_run=args.dry_run)
