"""Optional integration tests for V3 diff/apply RPC functions.

Enable explicitly with: RUN_V3_DB_INTEGRATION=1
Requires V3 migrations to be applied in Supabase.
"""

from __future__ import annotations

import os
import uuid

import pytest

from db import supabase

pytestmark = pytest.mark.integration


def _enabled() -> bool:
    return os.environ.get("RUN_V3_DB_INTEGRATION", "").strip() == "1"


def _insert_run(source: str, run_type: str, is_healthy: bool) -> str:
    row = (
        supabase.table("scrape_runs_v3")
        .insert(
            {
                "source": source,
                "run_type": run_type,
                "mode": "shadow",
                "status": "success",
                "staged_count": 1,
                "parse_fail_count": 0,
                "selector_fail_count": 0,
                "metadata": {"is_healthy": is_healthy, "remove_miss_threshold": 2},
            }
        )
        .execute()
        .data[0]
    )
    return row["id"]


def _vessel_payload(source: str, source_id: str, price: float, is_sold: bool = False) -> dict:
    return {
        "source": source,
        "source_id": source_id,
        "name": "Integration Vessel",
        "type": "Motorvrachtschip",
        "length_m": 80.0,
        "width_m": 9.5,
        "tonnage": 1200.0,
        "build_year": 2000,
        "price": price,
        "url": "https://example.com/integration",
        "image_url": "https://example.com/integration.jpg",
        "is_sold": is_sold,
    }


def _insert_listing_staging(run_id: str, source: str, source_id: str, payload: dict) -> None:
    supabase.table("scrape_listing_staging_v3").insert(
        {
            "run_id": run_id,
            "source": source,
            "source_id": source_id,
            "listing_payload": payload,
            "listing_fingerprint": f"lfp-{source_id}",
            "is_sold": bool(payload.get("is_sold", False)),
            "parse_ok": True,
        }
    ).execute()


def _insert_vessel_staging(run_id: str, source: str, source_id: str, payload: dict, is_sold: bool = False) -> None:
    supabase.table("scrape_vessel_staging_v3").insert(
        {
            "run_id": run_id,
            "source": source,
            "source_id": source_id,
            "vessel_payload": payload,
            "canonical_fingerprint": f"cfp-{source_id}",
            "is_sold": is_sold,
            "parse_ok": True,
        }
    ).execute()


def _cleanup_source(source: str) -> None:
    vessels = supabase.table("vessels").select("id").eq("source", source).execute().data or []
    vessel_ids = [v["id"] for v in vessels]

    if vessel_ids:
        supabase.table("activity_log").delete().in_("vessel_id", vessel_ids).execute()
        supabase.table("price_history").delete().in_("vessel_id", vessel_ids).execute()

    supabase.table("vessels").delete().eq("source", source).execute()
    supabase.table("scrape_notifications_outbox_v3").delete().eq("source", source).execute()
    supabase.table("scrape_diff_events_v3").delete().eq("source", source).execute()
    supabase.table("scrape_vessel_staging_v3").delete().eq("source", source).execute()
    supabase.table("scrape_listing_staging_v3").delete().eq("source", source).execute()
    supabase.table("scrape_detail_queue_v3").delete().eq("source", source).execute()
    supabase.table("scrape_runs_v3").delete().eq("source", source).execute()
    supabase.table("scrape_source_health_v3").delete().eq("source", source).execute()


@pytest.fixture
def integration_source_v3():
    if not _enabled():
        pytest.skip("Set RUN_V3_DB_INTEGRATION=1 to run DB integration tests")
    source = f"it_v3_{uuid.uuid4().hex[:8]}"
    try:
        yield source
    finally:
        _cleanup_source(source)


def test_compute_scrape_diff_v3_is_idempotent(integration_source_v3):
    run_id = _insert_run(integration_source_v3, "detect", is_healthy=True)
    payload = _vessel_payload(integration_source_v3, "s1", 100.0)
    _insert_vessel_staging(run_id, integration_source_v3, "s1", payload)

    supabase.rpc(
        "compute_scrape_diff_v3",
        {"p_run_id": run_id, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()
    supabase.rpc(
        "compute_scrape_diff_v3",
        {"p_run_id": run_id, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()

    events = (
        supabase.table("scrape_diff_events_v3")
        .select("source_id,event_type")
        .eq("run_id", run_id)
        .eq("source", integration_source_v3)
        .execute()
        .data
        or []
    )
    assert len(events) == 1
    assert events[0]["source_id"] == "s1"
    assert events[0]["event_type"] == "inserted"


def test_mark_missing_candidates_v3_respects_run_health(integration_source_v3):
    run_unhealthy = _insert_run(integration_source_v3, "reconcile", is_healthy=False)
    supabase.table("scrape_diff_events_v3").insert(
        {
            "run_id": run_unhealthy,
            "source": integration_source_v3,
            "source_id": "gone-1",
            "run_type": "reconcile",
            "event_type": "removed",
            "payload": {},
        }
    ).execute()
    misses_unhealthy = (
        supabase.rpc(
            "mark_missing_candidates_v3",
            {"p_run_id": run_unhealthy, "p_source": integration_source_v3},
        )
        .execute()
        .data
    )
    assert misses_unhealthy == 0

    run_healthy_removed = _insert_run(integration_source_v3, "reconcile", is_healthy=True)
    supabase.table("scrape_diff_events_v3").insert(
        {
            "run_id": run_healthy_removed,
            "source": integration_source_v3,
            "source_id": "gone-2",
            "run_type": "reconcile",
            "event_type": "removed",
            "payload": {},
        }
    ).execute()
    misses_healthy_removed = (
        supabase.rpc(
            "mark_missing_candidates_v3",
            {"p_run_id": run_healthy_removed, "p_source": integration_source_v3},
        )
        .execute()
        .data
    )
    assert misses_healthy_removed == 1

    run_healthy_no_removed = _insert_run(integration_source_v3, "reconcile", is_healthy=True)
    misses_healthy_no_removed = (
        supabase.rpc(
            "mark_missing_candidates_v3",
            {"p_run_id": run_healthy_no_removed, "p_source": integration_source_v3},
        )
        .execute()
        .data
    )
    assert misses_healthy_no_removed == 0


def test_apply_scrape_diff_v3_handles_sold_and_price_change(integration_source_v3):
    vessel = (
        supabase.table("vessels")
        .insert(
            {
                "source": integration_source_v3,
                "source_id": "s1",
                "name": "Integration Vessel",
                "type": "Motorvrachtschip",
                "price": 100.0,
                "url": "https://example.com/integration",
                "status": "active",
            }
        )
        .execute()
        .data[0]
    )
    vessel_id = vessel["id"]

    run_sold = _insert_run(integration_source_v3, "detect", is_healthy=True)
    sold_payload = _vessel_payload(integration_source_v3, "s1", 100.0, is_sold=True)
    _insert_vessel_staging(run_sold, integration_source_v3, "s1", sold_payload, is_sold=True)
    supabase.rpc(
        "compute_scrape_diff_v3",
        {"p_run_id": run_sold, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()
    supabase.rpc(
        "apply_scrape_diff_v3",
        {"p_run_id": run_sold, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()

    sold_status = supabase.table("vessels").select("status").eq("id", vessel_id).execute().data[0]["status"]
    assert sold_status == "sold"

    run_price = _insert_run(integration_source_v3, "detect", is_healthy=True)
    price_payload = _vessel_payload(integration_source_v3, "s1", 120.0, is_sold=False)
    _insert_vessel_staging(run_price, integration_source_v3, "s1", price_payload, is_sold=False)
    supabase.rpc(
        "compute_scrape_diff_v3",
        {"p_run_id": run_price, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()
    supabase.rpc(
        "apply_scrape_diff_v3",
        {"p_run_id": run_price, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()

    updated = supabase.table("vessels").select("price,status").eq("id", vessel_id).execute().data[0]
    assert float(updated["price"]) == 120.0
    assert updated["status"] == "active"


def test_apply_scrape_diff_v3_merges_detail_fields_for_unchanged(integration_source_v3):
    vessel = (
        supabase.table("vessels")
        .insert(
            {
                "source": integration_source_v3,
                "source_id": "same-price",
                "name": "Integration Vessel",
                "type": "Motorvrachtschip",
                "price": 100.0,
                "url": "https://example.com/integration",
                "image_url": "https://example.com/integration.jpg",
                "status": "active",
            }
        )
        .execute()
        .data[0]
    )
    vessel_id = vessel["id"]

    run_id = _insert_run(integration_source_v3, "detail-worker", is_healthy=True)
    payload = _vessel_payload(integration_source_v3, "same-price", 100.0, is_sold=False)
    payload["raw_details"] = {"engine": "integration-test"}
    payload["image_urls"] = ["https://example.com/integration-2.jpg"]
    _insert_vessel_staging(run_id, integration_source_v3, "same-price", payload, is_sold=False)

    supabase.rpc(
        "compute_scrape_diff_v3",
        {"p_run_id": run_id, "p_source": integration_source_v3, "p_run_type": "detail-worker"},
    ).execute()
    event = (
        supabase.table("scrape_diff_events_v3")
        .select("event_type")
        .eq("run_id", run_id)
        .eq("source", integration_source_v3)
        .eq("source_id", "same-price")
        .execute()
        .data[0]
    )
    assert event["event_type"] == "unchanged"

    supabase.rpc(
        "apply_scrape_diff_v3",
        {"p_run_id": run_id, "p_source": integration_source_v3, "p_run_type": "detail-worker"},
    ).execute()

    updated = supabase.table("vessels").select("raw_details,image_urls").eq("id", vessel_id).execute().data[0]
    assert updated["raw_details"] == {"engine": "integration-test"}
    assert updated["image_urls"] == ["https://example.com/integration-2.jpg"]


def test_apply_scrape_diff_v3_is_idempotent_for_same_run(integration_source_v3):
    run_id = _insert_run(integration_source_v3, "detect", is_healthy=True)
    payload = _vessel_payload(integration_source_v3, "same-run", 100.0)
    _insert_vessel_staging(run_id, integration_source_v3, "same-run", payload)
    supabase.rpc(
        "compute_scrape_diff_v3",
        {"p_run_id": run_id, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()

    supabase.rpc(
        "apply_scrape_diff_v3",
        {"p_run_id": run_id, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()
    supabase.rpc(
        "apply_scrape_diff_v3",
        {"p_run_id": run_id, "p_source": integration_source_v3, "p_run_type": "detect"},
    ).execute()

    vessel = (
        supabase.table("vessels")
        .select("id")
        .eq("source", integration_source_v3)
        .eq("source_id", "same-run")
        .execute()
        .data
        or []
    )
    assert len(vessel) == 1
    vessel_id = vessel[0]["id"]

    inserted_events = (
        supabase.table("activity_log")
        .select("event_type")
        .eq("vessel_id", vessel_id)
        .eq("event_type", "inserted")
        .execute()
        .data
        or []
    )
    assert len(inserted_events) == 1
