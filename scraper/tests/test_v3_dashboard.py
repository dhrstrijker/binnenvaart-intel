from __future__ import annotations

from datetime import datetime, timedelta, timezone

from v3_dashboard import _summarize


def _iso(minutes_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def test_summarize_24h_totals_and_run_type_stats():
    rows = [
        {
            "source": "galle",
            "run_type": "detect",
            "status": "success",
            "started_at": _iso(10),
            "external_request_count": 5,
            "supabase_write_count": 3,
            "run_duration_seconds": 12.0,
            "inserted_count": 1,
            "price_changed_count": 0,
            "sold_count": 0,
            "removed_count": 0,
            "unchanged_count": 10,
            "staged_count": 10,
            "parse_fail_count": 0,
        },
        {
            "source": "galle",
            "run_type": "detail-worker",
            "status": "success",
            "started_at": _iso(8),
            "external_request_count": 2,
            "supabase_write_count": 2,
            "run_duration_seconds": 5.0,
            "inserted_count": 0,
            "price_changed_count": 1,
            "sold_count": 0,
            "removed_count": 0,
            "unchanged_count": 2,
            "staged_count": 2,
            "parse_fail_count": 0,
        },
        {
            "source": "galle",
            "run_type": "reconcile",
            "status": "error",
            "started_at": _iso(6),
            "external_request_count": 11,
            "supabase_write_count": 1,
            "run_duration_seconds": 22.0,
            "error_message": "boom",
            "staged_count": 0,
            "parse_fail_count": 0,
        },
    ]

    snapshot = _summarize(rows, source_health_by_source={}, queue_rows=[])

    assert snapshot["total_runs_24h"] == 3
    assert snapshot["success_runs_24h"] == 2
    assert snapshot["total_requests_24h"] == 7
    assert snapshot["total_writes_24h"] == 5
    assert snapshot["event_totals_24h"]["inserted"] == 1
    assert snapshot["event_totals_24h"]["price_changed"] == 1
    assert snapshot["run_type_stats_24h"]["detect"]["runs"] == 1
    assert snapshot["run_type_stats_24h"]["detect"]["success"] == 1
    assert snapshot["run_type_stats_24h"]["reconcile"]["runs"] == 1
    assert snapshot["run_type_stats_24h"]["reconcile"]["success"] == 0
    assert len(snapshot["failure_rows"]) == 1


def test_summarize_emits_stale_and_queue_issue_signals():
    rows = [
        {
            "source": "galle",
            "run_type": "detect",
            "status": "success",
            "started_at": _iso(200),  # stale for detect
            "external_request_count": 1,
            "supabase_write_count": 1,
            "run_duration_seconds": 2.0,
            "staged_count": 10,
            "parse_fail_count": 3,
            "queue_oldest_age_minutes": 75,
        },
        {
            "source": "galle",
            "run_type": "detail-worker",
            "status": "success",
            "started_at": _iso(20),
            "external_request_count": 0,
            "supabase_write_count": 1,
            "run_duration_seconds": 2.0,
            "staged_count": 0,
            "parse_fail_count": 0,
        },
        {
            "source": "galle",
            "run_type": "reconcile",
            "status": "success",
            "started_at": _iso(30),
            "external_request_count": 10,
            "supabase_write_count": 5,
            "run_duration_seconds": 60.0,
            "staged_count": 10,
            "parse_fail_count": 0,
        },
    ]

    queue_rows = [
        {"source": "galle", "status": "pending", "created_at": _iso(120)},
        {"source": "galle", "status": "processing", "created_at": _iso(5)},
    ]

    snapshot = _summarize(
        rows,
        source_health_by_source={
            "galle": {
                "consecutive_unhealthy_runs": 1,
                "consecutive_miss_candidates": 2,
            }
        },
        queue_rows=queue_rows,
    )

    issue_text = " | ".join(snapshot["issues"])
    assert "stale" in issue_text
    assert "queue oldest age" in issue_text
    assert "parse fail ratio" in issue_text
    assert "consecutive unhealthy" in issue_text
    assert "miss candidate" in issue_text
    assert snapshot["queue_by_source"]["galle"]["pending"] == 1
    assert snapshot["queue_by_source"]["galle"]["processing"] == 1
