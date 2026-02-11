"""Alert routing for V3 pipeline threshold breaches."""

from __future__ import annotations

import logging
from statistics import median

import alerting
from db import supabase

logger = logging.getLogger(__name__)

COUNT_DROP_THRESHOLD_RATIO = 0.35
PARSE_FAIL_RATIO_THRESHOLD = 0.10
REMOVAL_BURST_MULTIPLIER = 3.0
QUEUE_AGE_THRESHOLD_MINUTES = 60.0
NOTIFICATION_LATENCY_THRESHOLD_SECONDS = 1800.0
HISTORY_WINDOW = 7


def evaluate_v3_run_alerts(results: list[dict]) -> None:
    for result in results:
        if result.get("mode") != "authoritative":
            continue
        if result.get("status") != "success":
            continue

        source = result["source"]
        run_id = result["run_id"]
        run_type = result.get("run_type", "detect")
        current_count = int(result.get("staged_count", result.get("listings", 0)))
        parse_fail_count = int(result.get("parse_fail_count", 0))
        removed_count = int(result.get("removed", 0))
        queue_oldest_age = result.get("queue_oldest_age_minutes")
        latency_p95 = result.get("notification_latency_seconds_p95")

        history = _load_recent_history(source, run_type, run_id)
        historical_counts = [h["staged_count"] for h in history if h.get("staged_count") is not None]
        historical_removed = [h["removed_count"] for h in history if h.get("removed_count") is not None]

        if len(historical_counts) >= 3:
            count_median = float(median(historical_counts))
            if count_median > 0:
                min_expected = count_median * (1.0 - COUNT_DROP_THRESHOLD_RATIO)
                if current_count < min_expected:
                    _emit_threshold_alert(
                        source=source,
                        error_type=f"v3_{run_type}_count_drop",
                        title=f"{source} v3 {run_type} count drop detected",
                        details=[
                            f"<strong>Current count:</strong> {current_count}",
                            f"<strong>7-run median:</strong> {count_median:.1f}",
                            f"<strong>Threshold:</strong> below {min_expected:.1f}",
                        ],
                        expected_count=int(round(min_expected)),
                        actual_count=current_count,
                    )

        parse_fail_ratio = (parse_fail_count / current_count) if current_count > 0 else 0.0
        if parse_fail_ratio > PARSE_FAIL_RATIO_THRESHOLD:
            _emit_threshold_alert(
                source=source,
                error_type=f"v3_{run_type}_parse_fail_ratio",
                title=f"{source} v3 {run_type} parse-fail ratio exceeded",
                details=[
                    f"<strong>Parse fail ratio:</strong> {parse_fail_ratio:.2%}",
                    f"<strong>Threshold:</strong> {PARSE_FAIL_RATIO_THRESHOLD:.0%}",
                    f"<strong>Parse failures:</strong> {parse_fail_count}/{current_count}",
                ],
                expected_count=int(PARSE_FAIL_RATIO_THRESHOLD * 100),
                actual_count=int(round(parse_fail_ratio * 100)),
            )

        if run_type == "reconcile" and len(historical_removed) >= 3:
            removed_median = float(median(historical_removed))
            burst_threshold = max(3.0, removed_median * REMOVAL_BURST_MULTIPLIER)
            if removed_count > burst_threshold:
                _emit_threshold_alert(
                    source=source,
                    error_type="v3_reconcile_removed_burst",
                    title=f"{source} v3 reconcile removal burst detected",
                    details=[
                        f"<strong>Removed this run:</strong> {removed_count}",
                        f"<strong>7-run median removed:</strong> {removed_median:.1f}",
                        f"<strong>Threshold:</strong> > {burst_threshold:.1f}",
                    ],
                    expected_count=int(round(burst_threshold)),
                    actual_count=removed_count,
                )

        if queue_oldest_age is not None and float(queue_oldest_age) > QUEUE_AGE_THRESHOLD_MINUTES:
            _emit_threshold_alert(
                source=source,
                error_type="v3_queue_oldest_age",
                title=f"{source} v3 queue backlog age high",
                details=[
                    f"<strong>Queue oldest age:</strong> {float(queue_oldest_age):.1f} minutes",
                    f"<strong>Threshold:</strong> {QUEUE_AGE_THRESHOLD_MINUTES:.0f} minutes",
                ],
                expected_count=int(QUEUE_AGE_THRESHOLD_MINUTES),
                actual_count=int(round(float(queue_oldest_age))),
            )

        if latency_p95 is not None and float(latency_p95) > NOTIFICATION_LATENCY_THRESHOLD_SECONDS:
            _emit_threshold_alert(
                source=source,
                error_type="v3_notification_latency",
                title=f"{source} v3 notification latency exceeded",
                details=[
                    f"<strong>Notification p95 latency:</strong> {float(latency_p95):.0f}s",
                    f"<strong>Threshold:</strong> {NOTIFICATION_LATENCY_THRESHOLD_SECONDS:.0f}s",
                ],
                expected_count=int(NOTIFICATION_LATENCY_THRESHOLD_SECONDS),
                actual_count=int(round(float(latency_p95))),
            )


def _load_recent_history(source: str, run_type: str, exclude_run_id: str) -> list[dict]:
    try:
        rows = (
            supabase.table("scrape_runs_v3")
            .select("id,staged_count,removed_count")
            .eq("source", source)
            .eq("run_type", run_type)
            .eq("status", "success")
            .order("started_at", desc=True)
            .limit(HISTORY_WINDOW + 1)
            .execute()
            .data
            or []
        )
    except Exception:
        logger.exception("Failed to load v3 history for alerting: %s", source)
        return []
    return [row for row in rows if row.get("id") != exclude_run_id][:HISTORY_WINDOW]


def _emit_threshold_alert(
    source: str,
    error_type: str,
    title: str,
    details: list[str],
    expected_count: int,
    actual_count: int,
) -> None:
    try:
        html = alerting._build_alert_html(
            title=title,
            severity="warning",
            details=details,
        )
        alerting.send_email_alert(f"V3 threshold alert: {source}/{error_type}", html)
        alerting._log_alert_to_db(
            source=source,
            error_type=error_type,
            error_message=title,
            expected_count=expected_count,
            actual_count=actual_count,
        )
    except Exception:
        logger.exception("Failed to emit v3 threshold alert for %s/%s", source, error_type)
