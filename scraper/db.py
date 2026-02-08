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
    # Motorvrachtschip (Motor cargo vessel)
    "motorvrachtschip": "Motorvrachtschip",
    "dry cargo vessel": "Motorvrachtschip",
    # Tankschip (Tanker)
    "tanker": "Tankschip",
    "motortankschip": "Tankschip",
    "tankschip": "Tankschip",
    "motor tanker": "Tankschip",
    # Duw/Sleepboot (Push/tug boat)
    "sleepboot": "Duw/Sleepboot",
    "duwboot": "Duw/Sleepboot",
    "duw/sleepboot": "Duw/Sleepboot",
    "pusher": "Duw/Sleepboot",
    # Duwbak (Push barge)
    "duwbak": "Duwbak",
    "pushbarge": "Duwbak",
    "push barge": "Duwbak",
    # Koppelverband (Coupled combination)
    "koppelverband": "Koppelverband",
    "push combination": "Koppelverband",
    # Beunschip (Hopper barge)
    "beunschip": "Beunschip",
    "motorbeunschip": "Beunschip",
    # Other canonical types
    "jacht": "Jacht",
    "woonschip": "Woonschip",
    "passagiersschip": "Passagiersschip",
    "nieuwbouw": "Nieuwbouw",
    "kraanschip": "Kraanschip",
    "ponton": "Ponton",
    "overige": "Overige",
    "accomodatieschepen": "Accomodatieschip",
    "accomodatieschip": "Accomodatieschip",
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


def _log_activity(
    vessel_id: str,
    event_type: str,
    vessel_name: str,
    vessel_source: str,
    old_price: float | None = None,
    new_price: float | None = None,
) -> None:
    """Log an activity event (fire-and-forget, never breaks the scraper)."""
    try:
        supabase.table("activity_log").insert({
            "vessel_id": vessel_id,
            "event_type": event_type,
            "vessel_name": vessel_name,
            "vessel_source": vessel_source,
            "old_price": old_price,
            "new_price": new_price,
        }).execute()
    except Exception:
        logger.exception("Failed to log activity for %s/%s", vessel_source, vessel_name)


def mark_removed(source: str, run_start: str) -> int:
    """Mark vessels from *source* not seen since *run_start* as removed.

    Returns the number of vessels marked removed.
    """
    resp = (
        supabase.table("vessels")
        .update({"status": "removed", "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("source", source)
        .eq("status", "active")
        .lt("scraped_at", run_start)
        .execute()
    )
    count = len(resp.data) if resp.data else 0
    if count > 0:
        logger.info("Marked %d %s vessels as removed", count, source)
        for row in resp.data:
            _changes.append({"kind": "removed", "vessel": row})
            _log_activity(
                vessel_id=row["id"],
                event_type="removed",
                vessel_name=row.get("name", ""),
                vessel_source=source,
                old_price=row.get("price"),
            )
    return count


def _sanitize_vessel(vessel: dict) -> None:
    """Discard implausible values that would pollute the database."""
    # Build year: must be a realistic year for a vessel
    by = vessel.get("build_year")
    if by is not None and (by < 1800 or by > datetime.now().year + 1):
        logger.warning("%s: implausible build_year %s, discarding", vessel.get("name"), by)
        vessel["build_year"] = None

    # Dimensions: no inland vessel is wider than 25m or longer than 200m
    if vessel.get("width_m") is not None and vessel["width_m"] > 25:
        logger.warning("%s: implausible width %.2fm, discarding", vessel.get("name"), vessel["width_m"])
        vessel["width_m"] = None
    if vessel.get("length_m") is not None and vessel["length_m"] > 200:
        logger.warning("%s: implausible length %.2fm, discarding", vessel.get("name"), vessel["length_m"])
        vessel["length_m"] = None


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

    _sanitize_vessel(vessel)

    is_sold = vessel.pop("is_sold", False)

    try:
        existing = (
            supabase.table("vessels")
            .select("id, price, status")
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
            vessel["status"] = "sold" if is_sold else "active"
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

            event = "sold" if is_sold else "inserted"
            _changes.append({"kind": event, "vessel": vessel})
            _log_activity(
                vessel_id=vessel_id,
                event_type=event,
                vessel_name=vessel.get("name", ""),
                vessel_source=source,
                new_price=vessel.get("price"),
            )
            return "inserted"

        vessel_id = existing.data[0]["id"]
        old_price = existing.data[0]["price"]
        old_status = existing.data[0].get("status", "active")
        new_price = vessel.get("price")
        new_status = "sold" if is_sold else "active"

        # Always sync enrichment fields when provided
        enrichment = {}
        for field in ("type", "build_year", "tonnage", "raw_details", "image_urls"):
            if vessel.get(field) is not None:
                enrichment[field] = vessel[field]

        # Detect sold transition (active/removed → sold)
        became_sold = is_sold and old_status != "sold"

        if old_price != new_price:
            update_data = {"price": new_price, "scraped_at": now, "updated_at": now, "status": new_status}
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
            _log_activity(
                vessel_id=vessel_id,
                event_type="price_changed",
                vessel_name=vessel.get("name", ""),
                vessel_source=source,
                old_price=old_price,
                new_price=new_price,
            )

            if became_sold:
                _changes.append({"kind": "sold", "vessel": vessel})
                _log_activity(
                    vessel_id=vessel_id,
                    event_type="sold",
                    vessel_name=vessel.get("name", ""),
                    vessel_source=source,
                    old_price=old_price,
                )

            return "price_changed"

        update_data = {"scraped_at": now, "status": new_status}
        update_data.update(enrichment)
        supabase.table("vessels").update(update_data).eq(
            "id", vessel_id
        ).execute()

        if became_sold:
            _changes.append({"kind": "sold", "vessel": vessel})
            _log_activity(
                vessel_id=vessel_id,
                event_type="sold",
                vessel_name=vessel.get("name", ""),
                vessel_source=source,
                old_price=old_price,
            )

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


def get_verified_subscribers() -> list[dict]:
    """Fetch subscribers where verified_at IS NOT NULL and active = TRUE."""
    res = (
        supabase.table("notification_subscribers")
        .select("id, user_id, email, preferences, unsubscribe_token")
        .eq("active", True)
        .not_.is_("verified_at", "null")
        .execute()
    )
    return res.data or []


def get_user_watchlist_vessel_ids(user_id: str) -> dict[str, dict[str, bool]]:
    """Get watchlist entries keyed by vessel_id with notification flags."""
    res = (
        supabase.table("watchlist")
        .select("vessel_id, notify_price_change, notify_status_change")
        .eq("user_id", user_id)
        .execute()
    )
    return {
        row["vessel_id"]: {
            "notify_price_change": row.get("notify_price_change", True),
            "notify_status_change": row.get("notify_status_change", True),
        }
        for row in (res.data or [])
    }


def save_notification_history(
    user_id: str,
    vessel_ids: list,
    notification_type: str,
    message_id: str | None = None,
) -> None:
    """Insert a record into notification_history."""
    supabase.table("notification_history").insert(
        {
            "user_id": user_id,
            "vessel_ids": vessel_ids,
            "notification_type": notification_type,
            "resend_message_id": message_id,
        }
    ).execute()


def get_subscribers_with_frequency(frequency: str) -> list[dict]:
    """Get verified subscribers whose preferences include the given frequency."""
    res = (
        supabase.table("notification_subscribers")
        .select("id, user_id, email, preferences, unsubscribe_token")
        .eq("active", True)
        .not_.is_("verified_at", "null")
        .not_.is_("user_id", "null")
        .execute()
    )
    # Filter by frequency preference in Python since JSONB filtering is complex
    return [s for s in (res.data or []) if (s.get("preferences") or {}).get("frequency") == frequency]


def get_user_saved_searches(user_id: str, frequency: str | None = None) -> list[dict]:
    """Get active saved searches for a user, optionally filtered by frequency."""
    query = supabase.table("saved_searches").select("*").eq("user_id", user_id).eq("active", True)
    if frequency:
        query = query.eq("frequency", frequency)
    return (query.execute()).data or []


def get_changes_since(cutoff_iso: str) -> list[dict]:
    """Get vessel changes since a given ISO timestamp.

    Combines price_history (price_changed) with activity_log (inserted/removed/sold).
    Returns change dicts compatible with the notification system format.
    """
    changes: list[dict] = []
    all_vessel_ids: set[str] = set()

    # 1. Price history entries (price_changed)
    price_res = (
        supabase.table("price_history")
        .select("vessel_id, price, recorded_at")
        .gte("recorded_at", cutoff_iso)
        .order("recorded_at", desc=False)
        .execute()
    )
    price_entries = price_res.data or []
    for row in price_entries:
        all_vessel_ids.add(row["vessel_id"])

    # 2. Activity log entries (inserted/removed/sold)
    activity_res = (
        supabase.table("activity_log")
        .select("vessel_id, event_type, old_price, new_price, recorded_at")
        .in_("event_type", ["inserted", "removed", "sold"])
        .gte("recorded_at", cutoff_iso)
        .order("recorded_at", desc=False)
        .execute()
    )
    activity_entries = activity_res.data or []
    for row in activity_entries:
        if row.get("vessel_id"):
            all_vessel_ids.add(row["vessel_id"])

    if not all_vessel_ids:
        return []

    # 3. Fetch all associated vessels in one query
    vessels_res = (
        supabase.table("vessels")
        .select("id, name, type, source, price, url, length_m, width_m, build_year, tonnage, status")
        .in_("id", list(all_vessel_ids))
        .execute()
    )
    vessel_map = {v["id"]: v for v in (vessels_res.data or [])}

    # 4. Build price_changed entries
    for entry in price_entries:
        vessel = vessel_map.get(entry["vessel_id"])
        if not vessel:
            continue
        changes.append({
            "kind": "price_changed",
            "vessel": vessel,
            "new_price": entry["price"],
            "recorded_at": entry["recorded_at"],
        })

    # 5. Build activity_log entries
    for entry in activity_entries:
        vessel = vessel_map.get(entry.get("vessel_id"))
        if not vessel:
            continue
        change: dict = {
            "kind": entry["event_type"],
            "vessel": vessel,
            "recorded_at": entry["recorded_at"],
        }
        if entry.get("new_price") is not None:
            change["new_price"] = entry["new_price"]
        if entry.get("old_price") is not None:
            change["old_price"] = entry["old_price"]
        changes.append(change)

    # 6. Sort combined list by recorded_at
    changes.sort(key=lambda c: c.get("recorded_at", ""))

    return changes
