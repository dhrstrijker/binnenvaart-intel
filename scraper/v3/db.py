"""V3 database access helpers."""

from __future__ import annotations

from datetime import datetime, timezone

from db import supabase


def queue_depth_and_oldest_age_minutes(source: str) -> tuple[int, float | None]:
    rows = (
        supabase.table("scrape_detail_queue_v3")
        .select("id,created_at")
        .eq("source", source)
        .in_("status", ["pending", "processing"])
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )
    if not rows:
        return 0, None

    oldest = rows[0].get("created_at")
    if not oldest:
        return len(rows), None

    oldest_dt = datetime.fromisoformat(oldest.replace("Z", "+00:00"))
    age_minutes = (datetime.now(timezone.utc) - oldest_dt).total_seconds() / 60.0
    return len(rows), max(0.0, round(age_minutes, 3))


def load_outbox_pending(limit: int = 200) -> list[dict]:
    return (
        supabase.table("scrape_notifications_outbox_v3")
        .select("id,run_id,source,event_id,event_type,payload,created_at")
        .eq("status", "pending")
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
        .data
        or []
    )


def mark_outbox_sent(ids: list[str]) -> None:
    if not ids:
        return
    supabase.table("scrape_notifications_outbox_v3").update(
        {
            "status": "sent",
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "last_error": None,
        }
    ).in_("id", ids).execute()


def mark_outbox_failed(ids: list[str], error_message: str) -> None:
    if not ids:
        return

    # Keep attempts bounded and leave rows pending for future retries.
    rows = (
        supabase.table("scrape_notifications_outbox_v3")
        .select("id,attempt_count")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    for row in rows:
        supabase.table("scrape_notifications_outbox_v3").update(
            {
                "status": "pending",
                "attempt_count": int(row.get("attempt_count", 0)) + 1,
                "last_error": (error_message or "")[:500],
            }
        ).eq("id", row["id"]).execute()


def load_vessel_by_source_id(source: str, source_id: str) -> dict | None:
    rows = (
        supabase.table("vessels")
        .select("id,name,type,source,price,url,length_m,width_m,build_year,tonnage,status")
        .eq("source", source)
        .eq("source_id", source_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def load_vessels_by_source_ids(source: str, source_ids: list[str]) -> dict[str, dict]:
    ids = [str(s) for s in source_ids if s]
    if not ids:
        return {}
    rows = (
        supabase.table("vessels")
        .select("id,name,type,source,source_id,price,url,length_m,width_m,build_year,tonnage,status")
        .eq("source", source)
        .in_("source_id", ids)
        .execute()
        .data
        or []
    )
    return {str(row["source_id"]): row for row in rows}


def update_run_v3(run_id: str, patch: dict) -> None:
    supabase.table("scrape_runs_v3").update(patch).eq("id", run_id).execute()
