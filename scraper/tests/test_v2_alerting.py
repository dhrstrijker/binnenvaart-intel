from unittest.mock import patch

from v2.alerting_v2 import evaluate_v2_run_alerts


def test_skips_non_authoritative_results():
    with patch("v2.alerting_v2._emit_threshold_alert") as emit_alert:
        evaluate_v2_run_alerts(
            [
                {
                    "mode": "shadow",
                    "source": "galle",
                    "run_id": "r1",
                    "staged_count": 10,
                    "parse_fail_count": 5,
                    "removed": 5,
                }
            ]
        )
    emit_alert.assert_not_called()


def test_triggers_count_drop_parse_ratio_and_removal_burst():
    result = {
        "mode": "authoritative",
        "source": "galle",
        "run_id": "r1",
        "staged_count": 50,
        "parse_fail_count": 20,
        "removed": 10,
    }
    history = [
        {"staged_count": 100, "removed_count": 2},
        {"staged_count": 102, "removed_count": 2},
        {"staged_count": 98, "removed_count": 2},
        {"staged_count": 101, "removed_count": 1},
    ]

    with patch("v2.alerting_v2._load_recent_history", return_value=history), patch(
        "v2.alerting_v2._emit_threshold_alert"
    ) as emit_alert:
        evaluate_v2_run_alerts([result])

    assert emit_alert.call_count == 3
    error_types = [call.kwargs["error_type"] for call in emit_alert.call_args_list]
    assert "v2_count_drop" in error_types
    assert "v2_parse_fail_ratio" in error_types
    assert "v2_removed_burst" in error_types


def test_no_alert_when_values_within_thresholds():
    result = {
        "mode": "authoritative",
        "source": "galle",
        "run_id": "r1",
        "staged_count": 95,
        "parse_fail_count": 4,
        "removed": 2,
    }
    history = [
        {"staged_count": 100, "removed_count": 2},
        {"staged_count": 102, "removed_count": 2},
        {"staged_count": 98, "removed_count": 2},
    ]

    with patch("v2.alerting_v2._load_recent_history", return_value=history), patch(
        "v2.alerting_v2._emit_threshold_alert"
    ) as emit_alert:
        evaluate_v2_run_alerts([result])

    emit_alert.assert_not_called()

