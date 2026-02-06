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
