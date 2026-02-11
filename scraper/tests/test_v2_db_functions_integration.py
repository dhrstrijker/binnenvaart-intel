"""Optional integration tests for V2 diff/apply RPC functions.

These tests require a live Supabase project with V2 migrations applied.
Enable explicitly with: RUN_V2_DB_INTEGRATION=1
"""

from __future__ import annotations

import os
import uuid

import pytest

from db import supabase

pytestmark = pytest.mark.integration


def _enabled() -> bool:
    return os.environ.get("RUN_V2_DB_INTEGRATION", "").strip() == "1"


def _insert_run(source: str, is_healthy: bool) -> str:
    row = supabase.table("scrape_runs_v2").insert(
        {
            "source": source,
            "mode": "shadow",
            "status": "success",
            "staged_count": 1,
            "parse_fail_count": 0,
            "selector_fail_count": 0,
            "metadata": {"is_healthy": is_healthy},
        }
    ).execute().data[0]
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


def _insert_staging(run_id: str, source: str, source_id: str, payload: dict, is_sold: bool = False) -> None:
    supabase.table("scrape_vessel_staging").insert(
        {
            "run_id": run_id,
            "source": source,
            "source_id": source_id,
            "vessel_payload": payload,
            "canonical_fingerprint": f"fp-{source_id}",
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
    supabase.table("scrape_diff_events_v2").delete().eq("source", source).execute()
    supabase.table("scrape_vessel_staging").delete().eq("source", source).execute()
    supabase.table("scrape_listing_staging").delete().eq("source", source).execute()
    supabase.table("scrape_runs_v2").delete().eq("source", source).execute()
    supabase.table("scrape_source_health_v2").delete().eq("source", source).execute()


@pytest.fixture
def integration_source():
    if not _enabled():
        pytest.skip("Set RUN_V2_DB_INTEGRATION=1 to run DB integration tests")
    source = f"it_v2_{uuid.uuid4().hex[:8]}"
    try:
        yield source
    finally:
        _cleanup_source(source)


def test_compute_scrape_diff_is_idempotent(integration_source):
    run_id = _insert_run(integration_source, is_healthy=True)
    payload = _vessel_payload(integration_source, "s1", 100.0)
    _insert_staging(run_id, integration_source, "s1", payload)

    supabase.rpc("compute_scrape_diff", {"p_run_id": run_id, "p_source": integration_source}).execute()
    supabase.rpc("compute_scrape_diff", {"p_run_id": run_id, "p_source": integration_source}).execute()

    events = (
        supabase.table("scrape_diff_events_v2")
        .select("source_id,event_type")
        .eq("run_id", run_id)
        .eq("source", integration_source)
        .execute()
        .data
        or []
    )
    assert len(events) == 1
    assert events[0]["source_id"] == "s1"
    assert events[0]["event_type"] == "inserted"


def test_mark_missing_candidates_respects_run_health(integration_source):
    run_unhealthy = _insert_run(integration_source, is_healthy=False)
    supabase.table("scrape_diff_events_v2").insert(
        {
            "run_id": run_unhealthy,
            "source": integration_source,
            "source_id": "gone-1",
            "event_type": "removed",
            "payload": {},
        }
    ).execute()
    result_unhealthy = supabase.rpc(
        "mark_missing_candidates",
        {"p_run_id": run_unhealthy, "p_source": integration_source},
    ).execute().data
    assert result_unhealthy == 0

    run_healthy_removed = _insert_run(integration_source, is_healthy=True)
    supabase.table("scrape_diff_events_v2").insert(
        {
            "run_id": run_healthy_removed,
            "source": integration_source,
            "source_id": "gone-2",
            "event_type": "removed",
            "payload": {},
        }
    ).execute()
    result_healthy_removed = supabase.rpc(
        "mark_missing_candidates",
        {"p_run_id": run_healthy_removed, "p_source": integration_source},
    ).execute().data
    assert result_healthy_removed == 1

    run_healthy_no_removed = _insert_run(integration_source, is_healthy=True)
    result_healthy_no_removed = supabase.rpc(
        "mark_missing_candidates",
        {"p_run_id": run_healthy_no_removed, "p_source": integration_source},
    ).execute().data
    assert result_healthy_no_removed == 0


def test_apply_scrape_diff_handles_sold_and_price_change_transitions(integration_source):
    vessel = (
        supabase.table("vessels")
        .insert(
            {
                "source": integration_source,
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

    run_sold = _insert_run(integration_source, is_healthy=True)
    sold_payload = _vessel_payload(integration_source, "s1", 100.0, is_sold=True)
    _insert_staging(run_sold, integration_source, "s1", sold_payload, is_sold=True)
    supabase.rpc("compute_scrape_diff", {"p_run_id": run_sold, "p_source": integration_source}).execute()
    supabase.rpc("mark_missing_candidates", {"p_run_id": run_sold, "p_source": integration_source}).execute()
    supabase.rpc("apply_scrape_diff", {"p_run_id": run_sold, "p_source": integration_source}).execute()

    sold_status = (
        supabase.table("vessels").select("status").eq("id", vessel_id).execute().data[0]["status"]
    )
    assert sold_status == "sold"

    sold_events = (
        supabase.table("activity_log")
        .select("event_type")
        .eq("vessel_id", vessel_id)
        .eq("event_type", "sold")
        .execute()
        .data
        or []
    )
    assert sold_events

    run_price = _insert_run(integration_source, is_healthy=True)
    price_payload = _vessel_payload(integration_source, "s1", 120.0, is_sold=False)
    _insert_staging(run_price, integration_source, "s1", price_payload, is_sold=False)
    supabase.rpc("compute_scrape_diff", {"p_run_id": run_price, "p_source": integration_source}).execute()
    supabase.rpc("mark_missing_candidates", {"p_run_id": run_price, "p_source": integration_source}).execute()
    supabase.rpc("apply_scrape_diff", {"p_run_id": run_price, "p_source": integration_source}).execute()

    updated = supabase.table("vessels").select("price,status").eq("id", vessel_id).execute().data[0]
    assert float(updated["price"]) == 120.0
    assert updated["status"] == "active"

    price_rows = (
        supabase.table("price_history")
        .select("price")
        .eq("vessel_id", vessel_id)
        .eq("price", 120.0)
        .execute()
        .data
        or []
    )
    assert price_rows

