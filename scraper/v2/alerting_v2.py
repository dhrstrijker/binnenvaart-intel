"""Alert routing for V2 pipeline threshold breaches."""

from __future__ import annotations

import logging
from statistics import median

import alerting
from db import supabase

logger = logging.getLogger(__name__)

COUNT_DROP_THRESHOLD_RATIO = 0.35
PARSE_FAIL_RATIO_THRESHOLD = 0.10
REMOVAL_BURST_MULTIPLIER = 3.0
HISTORY_WINDOW = 7


def evaluate_v2_run_alerts(results: list[dict]) -> None:
    """Evaluate per-source threshold alerts for V2 runs.

    Thresholds:
    - source count drop >35% vs trailing 7-run median
    - parse fail ratio >10%
    - removed burst >3x trailing 7-run median removed count
    """
    for result in results:
        if result.get("mode") != "authoritative":
            continue
        source = result["source"]
        run_id = result["run_id"]
        current_count = int(result.get("staged_count", result.get("listings", 0)))
        parse_fail_count = int(result.get("parse_fail_count", 0))
        removed_count = int(result.get("removed", 0))

        history = _load_recent_history(source, run_id)
        historical_counts = [h["staged_count"] for h in history if h.get("staged_count") is not None]
        historical_removed = [h["removed_count"] for h in history if h.get("removed_count") is not None]

        if len(historical_counts) >= 3:
            count_median = float(median(historical_counts))
            if count_median > 0:
                min_expected = count_median * (1.0 - COUNT_DROP_THRESHOLD_RATIO)
                if current_count < min_expected:
                    _emit_threshold_alert(
                        source=source,
                        error_type="v2_count_drop",
                        title=f"{source} v2 count drop detected",
                        details=[
                            f"<strong>Current count:</strong> {current_count}",
                            f"<strong>7-run median:</strong> {count_median:.1f}",
                            f"<strong>Threshold:</strong> below {min_expected:.1f} ({int(COUNT_DROP_THRESHOLD_RATIO * 100)}% drop)",
                        ],
                        expected_count=int(round(min_expected)),
                        actual_count=current_count,
                    )

        parse_fail_ratio = (parse_fail_count / current_count) if current_count > 0 else 0.0
        if parse_fail_ratio > PARSE_FAIL_RATIO_THRESHOLD:
            _emit_threshold_alert(
                source=source,
                error_type="v2_parse_fail_ratio",
                title=f"{source} v2 parse-fail ratio exceeded",
                details=[
                    f"<strong>Parse fail ratio:</strong> {parse_fail_ratio:.2%}",
                    f"<strong>Threshold:</strong> {PARSE_FAIL_RATIO_THRESHOLD:.0%}",
                    f"<strong>Parse failures:</strong> {parse_fail_count}/{current_count}",
                ],
                expected_count=int(PARSE_FAIL_RATIO_THRESHOLD * 100),
                actual_count=int(round(parse_fail_ratio * 100)),
            )

        if len(historical_removed) >= 3:
            removed_median = float(median(historical_removed))
            burst_threshold = max(3.0, removed_median * REMOVAL_BURST_MULTIPLIER)
            if removed_count > burst_threshold:
                _emit_threshold_alert(
                    source=source,
                    error_type="v2_removed_burst",
                    title=f"{source} v2 removal burst detected",
                    details=[
                        f"<strong>Removed this run:</strong> {removed_count}",
                        f"<strong>7-run median removed:</strong> {removed_median:.1f}",
                        f"<strong>Threshold:</strong> > {burst_threshold:.1f} (x{REMOVAL_BURST_MULTIPLIER:.0f})",
                    ],
                    expected_count=int(round(burst_threshold)),
                    actual_count=removed_count,
                )


def _load_recent_history(source: str, exclude_run_id: str) -> list[dict]:
    try:
        rows = (
            supabase.table("scrape_runs_v2")
            .select("id,staged_count,removed_count")
            .eq("source", source)
            .eq("status", "success")
            .order("started_at", desc=True)
            .limit(HISTORY_WINDOW + 1)
            .execute()
            .data
            or []
        )
    except Exception:
        logger.exception("Failed to load v2 history for alerting: %s", source)
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
        html = alerting._build_alert_html(  # noqa: SLF001 - intentionally reusing shared template
            title=title,
            severity="warning",
            details=details,
        )
        alerting.send_email_alert(f"V2 threshold alert: {source}/{error_type}", html)
        alerting._log_alert_to_db(  # noqa: SLF001 - intentionally reusing deduplicated alert log path
            source=source,
            error_type=error_type,
            error_message=title,
            expected_count=expected_count,
            actual_count=actual_count,
        )
    except Exception:
        logger.exception("Failed to emit v2 threshold alert for %s/%s", source, error_type)
