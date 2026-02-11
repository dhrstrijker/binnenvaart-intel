from unittest.mock import patch

from v3.alerting import evaluate_v3_run_alerts


def test_v3_alerting_skips_shadow_runs():
    with patch("v3.alerting._emit_threshold_alert") as emit_alert:
        evaluate_v3_run_alerts(
            [
                {
                    "mode": "shadow",
                    "status": "success",
                    "run_type": "detect",
                    "source": "galle",
                    "run_id": "r1",
                    "staged_count": 10,
                    "parse_fail_count": 5,
                    "removed": 5,
                }
            ]
        )
    emit_alert.assert_not_called()


def test_v3_alerting_triggers_queue_age_and_parse_ratio():
    result = {
        "mode": "authoritative",
        "status": "success",
        "run_type": "detect",
        "source": "galle",
        "run_id": "r1",
        "staged_count": 50,
        "parse_fail_count": 20,
        "removed": 0,
        "queue_oldest_age_minutes": 90,
    }
    history = [
        {"staged_count": 100, "removed_count": 2},
        {"staged_count": 101, "removed_count": 1},
        {"staged_count": 99, "removed_count": 2},
    ]

    with patch("v3.alerting._load_recent_history", return_value=history), patch(
        "v3.alerting._emit_threshold_alert"
    ) as emit_alert:
        evaluate_v3_run_alerts([result])

    error_types = [call.kwargs["error_type"] for call in emit_alert.call_args_list]
    assert "v3_detect_parse_fail_ratio" in error_types
    assert "v3_queue_oldest_age" in error_types
    assert "v3_detect_count_drop" in error_types
