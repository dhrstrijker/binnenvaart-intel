import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logger = logging.getLogger(__name__)

_url = os.environ["SUPABASE_URL"]
_key = os.environ["SUPABASE_KEY"]
supabase = create_client(_url, _key)

# Canonical type mapping: raw variations → single canonical name.
# Keys are lowercase for case-insensitive matching.
TYPE_MAP: dict[str, str] = {
    "tanker": "Tankschip",
    "motortankschip": "Tankschip",
    "sleepboot": "Duw/Sleepboot",
    "duwboot": "Duw/Sleepboot",
}


def normalize_type(raw_type: str | None) -> str | None:
    """Normalize a vessel type to its canonical name.

    Returns the canonical type if a mapping exists, otherwise
    returns the original value unchanged.  Returns None for None input.
    """
    if raw_type is None:
        return None
    return TYPE_MAP.get(raw_type.strip().lower(), raw_type)

# Module-level list that collects all changes for notification emails.
# Reset via clear_changes() before a scrape run; read via get_changes() after.
_changes: list[dict] = []


def clear_changes() -> None:
    """Reset the collected changes list."""
    _changes.clear()


def get_changes() -> list[dict]:
    """Return a copy of all collected changes."""
    return list(_changes)


def upsert_vessel(vessel: dict) -> str:
    """Upsert a vessel record and track price changes.

    Returns one of: "inserted", "price_changed", "unchanged", "error".
    Change details are automatically collected in the module-level list.
    """
    source = vessel["source"]
    source_id = vessel["source_id"]
    now = datetime.now(timezone.utc).isoformat()

    # Normalize type before any DB operations
    if "type" in vessel:
        vessel["type"] = normalize_type(vessel["type"])

    try:
        existing = (
            supabase.table("vessels")
            .select("id, price")
            .eq("source", source)
            .eq("source_id", source_id)
            .execute()
        )
    except Exception:
        logger.exception("Failed to query vessel %s/%s", source, source_id)
        return "error"

    try:
        if not existing.data:
            vessel["scraped_at"] = now
            row = supabase.table("vessels").insert(vessel).execute()
            vessel_id = row.data[0]["id"]

            if vessel.get("price") is not None:
                supabase.table("price_history").insert(
                    {
                        "vessel_id": vessel_id,
                        "price": vessel["price"],
                        "recorded_at": now,
                    }
                ).execute()

            _changes.append({"kind": "inserted", "vessel": vessel})
            return "inserted"

        vessel_id = existing.data[0]["id"]
        old_price = existing.data[0]["price"]
        new_price = vessel.get("price")

        # Always sync enrichment fields when provided
        enrichment = {}
        for field in ("type", "build_year", "tonnage", "raw_details", "image_urls"):
            if vessel.get(field) is not None:
                enrichment[field] = vessel[field]

        if old_price != new_price:
            update_data = {"price": new_price, "scraped_at": now, "updated_at": now}
            update_data.update(enrichment)
            supabase.table("vessels").update(update_data).eq(
                "id", vessel_id
            ).execute()

            if new_price is not None:
                supabase.table("price_history").insert(
                    {
                        "vessel_id": vessel_id,
                        "price": new_price,
                        "recorded_at": now,
                    }
                ).execute()

            _changes.append({
                "kind": "price_changed",
                "vessel": vessel,
                "old_price": old_price,
                "new_price": new_price,
            })
            return "price_changed"

        update_data = {"scraped_at": now}
        update_data.update(enrichment)
        supabase.table("vessels").update(update_data).eq(
            "id", vessel_id
        ).execute()
        return "unchanged"

    except Exception:
        logger.exception("Failed to upsert vessel %s/%s", source, source_id)
        return "error"


def run_dedup() -> dict:
    """Find duplicate vessels across sources and link them.

    Matching rule: LOWER(TRIM(name)) + length_m within 2m + width_m within 1m.
    Returns summary dict with counts.
    """
    logger.info("Running deduplication...")

    # 1. Fetch all vessels
    resp = supabase.table("vessels").select(
        "id, name, source, length_m, width_m, price, raw_details, first_seen_at, url"
    ).execute()
    vessels = resp.data or []
    logger.info("Fetched %d vessels for dedup", len(vessels))

    # 2. Reset all dedup columns (clean slate each run)
    supabase.table("vessels").update(
        {"canonical_vessel_id": None, "linked_sources": None}
    ).neq("id", "00000000-0000-0000-0000-000000000000").execute()

    # 3. Group by normalised name
    groups: dict[str, list[dict]] = {}
    for v in vessels:
        key = (v.get("name") or "").strip().lower()
        if key:
            groups.setdefault(key, []).append(v)

    linked_count = 0
    cluster_count = 0

    for name_key, group in groups.items():
        if len(group) < 2:
            continue

        # 4. Build clusters where dimensions match
        clusters = _build_clusters(group)

        for cluster in clusters:
            if len(cluster) < 2:
                continue

            cluster_count += 1

            # 5. Pick canonical vessel
            canonical = _pick_canonical(cluster)

            # 6. Set canonical_vessel_id on non-canonical vessels
            non_canonical_ids = [v["id"] for v in cluster if v["id"] != canonical["id"]]
            for vid in non_canonical_ids:
                supabase.table("vessels").update(
                    {"canonical_vessel_id": canonical["id"]}
                ).eq("id", vid).execute()
                linked_count += 1

            # 7. Build and set linked_sources on canonical
            linked = [_source_entry(canonical)]
            for v in cluster:
                if v["id"] != canonical["id"]:
                    linked.append(_source_entry(v))

            supabase.table("vessels").update(
                {"linked_sources": linked}
            ).eq("id", canonical["id"]).execute()

    logger.info(
        "Dedup complete: %d clusters, %d vessels linked as duplicates",
        cluster_count, linked_count,
    )
    return {"clusters": cluster_count, "linked": linked_count}


def _dims_match(a: dict, b: dict) -> bool:
    """Check if two vessels have matching dimensions within tolerance."""
    a_len = a.get("length_m")
    a_wid = a.get("width_m")
    b_len = b.get("length_m")
    b_wid = b.get("width_m")

    # Both must have non-NULL dimensions
    if a_len is None or a_wid is None or b_len is None or b_wid is None:
        return False

    return abs(float(a_len) - float(b_len)) <= 2 and abs(float(a_wid) - float(b_wid)) <= 1


def _build_clusters(group: list[dict]) -> list[list[dict]]:
    """Build clusters of vessels that match on dimensions using union-find."""
    n = len(group)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    for i in range(n):
        for j in range(i + 1, n):
            if _dims_match(group[i], group[j]):
                union(i, j)

    clusters_map: dict[int, list[dict]] = {}
    for i in range(n):
        root = find(i)
        clusters_map.setdefault(root, []).append(group[i])

    return list(clusters_map.values())


def _pick_canonical(cluster: list[dict]) -> dict:
    """Pick the canonical vessel: prefer has-price > has-raw_details > earliest first_seen_at."""
    def sort_key(v: dict):
        has_price = 0 if v.get("price") is not None else 1
        has_details = 0 if v.get("raw_details") is not None else 1
        first_seen = v.get("first_seen_at") or "9999"
        return (has_price, has_details, first_seen)

    return min(cluster, key=sort_key)


def _source_entry(v: dict) -> dict:
    """Build a linked_sources entry for a vessel."""
    return {
        "source": v["source"],
        "price": v.get("price"),
        "url": v.get("url") or "",
        "vessel_id": v["id"],
    }
