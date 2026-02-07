"""Tests for the alerting module: circuit breaker + email alerts."""

from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone

import alerting


class _FakeResponse:
    def __init__(self, data=None):
        self.data = data or []


def _make_mock_supabase():
    mock = MagicMock()
    mock.table.return_value.insert.return_value.execute.return_value = _FakeResponse()
    return mock


class TestGetHistoricalAvg:
    def test_returns_average_of_successful_runs(self):
        mock_sb = _make_mock_supabase()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute.return_value = (
            _FakeResponse(data=[
                {"vessel_count": 140},
                {"vessel_count": 138},
                {"vessel_count": 142},
            ])
        )
        with patch.object(alerting, "supabase", mock_sb):
            avg = alerting.get_historical_avg("gtsschepen")
        assert avg == 140

    def test_returns_zero_when_no_history(self):
        mock_sb = _make_mock_supabase()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute.return_value = (
            _FakeResponse(data=[])
        )
        with patch.object(alerting, "supabase", mock_sb):
            avg = alerting.get_historical_avg("new_source")
        assert avg == 0

    def test_returns_negative_one_on_db_failure(self):
        mock_sb = _make_mock_supabase()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.gte.return_value.execute.side_effect = Exception("DB down")
        with patch.object(alerting, "supabase", mock_sb):
            avg = alerting.get_historical_avg("galle")
        assert avg == -1


class TestShouldAllowMarkRemoved:
    def test_allows_when_count_is_normal(self):
        with patch.object(alerting, "get_historical_avg", return_value=140):
            assert alerting.should_allow_mark_removed("gtsschepen", 135) is True

    def test_allows_at_exactly_50_percent(self):
        with patch.object(alerting, "get_historical_avg", return_value=140):
            assert alerting.should_allow_mark_removed("gtsschepen", 70) is True

    def test_blocks_below_50_percent(self):
        with patch.object(alerting, "get_historical_avg", return_value=140):
            assert alerting.should_allow_mark_removed("gtsschepen", 69) is False

    def test_blocks_on_extreme_drop(self):
        with patch.object(alerting, "get_historical_avg", return_value=140):
            assert alerting.should_allow_mark_removed("gtsschepen", 12) is False

    def test_allows_new_source_no_history(self):
        with patch.object(alerting, "get_historical_avg", return_value=0):
            assert alerting.should_allow_mark_removed("new_source", 5) is True

    def test_blocks_when_db_query_fails(self):
        with patch.object(alerting, "get_historical_avg", return_value=-1):
            assert alerting.should_allow_mark_removed("galle", 25) is False


class TestLogScraperRun:
    def test_inserts_success_run(self):
        mock_sb = _make_mock_supabase()
        with patch.object(alerting, "supabase", mock_sb):
            alerting.log_scraper_run("galle", 25, "success")
        mock_sb.table.assert_called_with("scraper_runs")
        inserted = mock_sb.table.return_value.insert.call_args[0][0]
        assert inserted["source"] == "galle"
        assert inserted["vessel_count"] == 25
        assert inserted["status"] == "success"
        assert "error_message" not in inserted

    def test_inserts_error_run_with_message(self):
        mock_sb = _make_mock_supabase()
        with patch.object(alerting, "supabase", mock_sb):
            alerting.log_scraper_run("galle", 0, "error", "Connection refused")
        inserted = mock_sb.table.return_value.insert.call_args[0][0]
        assert inserted["status"] == "error"
        assert inserted["error_message"] == "Connection refused"

    def test_inserts_blocked_run(self):
        mock_sb = _make_mock_supabase()
        with patch.object(alerting, "supabase", mock_sb):
            alerting.log_scraper_run("gtsschepen", 12, "blocked")
        inserted = mock_sb.table.return_value.insert.call_args[0][0]
        assert inserted["status"] == "blocked"
        assert inserted["vessel_count"] == 12

    def test_swallows_db_exceptions(self):
        mock_sb = _make_mock_supabase()
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception("DB down")
        with patch.object(alerting, "supabase", mock_sb):
            alerting.log_scraper_run("galle", 25, "success")


class TestAlertDeduplication:
    def test_skips_db_insert_when_open_alert_exists(self):
        mock_sb = _make_mock_supabase()
        # _has_open_alert returns True (existing open alert)
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
            _FakeResponse(data=[{"id": "existing-alert"}])
        )
        with patch.object(alerting, "supabase", mock_sb), \
             patch.object(alerting, "send_email_alert"):
            alerting._log_alert_to_db("galle", "zero_vessels", "test error")
        # insert should NOT have been called (only select was called for dedup check)
        mock_sb.table.return_value.insert.assert_not_called()

    def test_inserts_when_no_open_alert(self):
        mock_sb = _make_mock_supabase()
        # _has_open_alert returns False
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = (
            _FakeResponse(data=[])
        )
        with patch.object(alerting, "supabase", mock_sb):
            alerting._log_alert_to_db("galle", "zero_vessels", "test error",
                                      expected_count=25, actual_count=0)
        mock_sb.table.return_value.insert.assert_called_once()
        inserted = mock_sb.table.return_value.insert.call_args[0][0]
        assert inserted["source"] == "galle"
        assert inserted["error_type"] == "zero_vessels"
        assert inserted["status"] == "open"


class TestSendEmailAlert:
    def test_sends_via_resend(self):
        with patch.object(alerting, "ALERT_EMAIL", "test@example.com"), \
             patch.object(alerting.resend.Emails, "send") as mock_send:
            alerting.send_email_alert("Test subject", "<p>body</p>")
        mock_send.assert_called_once()
        args = mock_send.call_args[0][0]
        assert args["to"] == "test@example.com"
        assert args["subject"] == "Test subject"

    def test_skips_when_no_api_key(self):
        with patch.object(alerting.resend, "api_key", ""), \
             patch.object(alerting.resend.Emails, "send") as mock_send:
            alerting.send_email_alert("Test", "<p>body</p>")
        mock_send.assert_not_called()

    def test_skips_when_no_alert_email(self):
        with patch.object(alerting, "ALERT_EMAIL", ""), \
             patch.object(alerting.resend.Emails, "send") as mock_send:
            alerting.send_email_alert("Test", "<p>body</p>")
        mock_send.assert_not_called()

    def test_swallows_send_exceptions(self):
        with patch.object(alerting, "ALERT_EMAIL", "test@example.com"), \
             patch.object(alerting.resend.Emails, "send", side_effect=Exception("API down")):
            alerting.send_email_alert("Test", "<p>body</p>")


class TestAlertFunctions:
    def test_alert_scraper_failure_sends_email_and_logs(self):
        with patch.object(alerting, "send_email_alert") as mock_email, \
             patch.object(alerting, "_log_alert_to_db") as mock_db:
            alerting.alert_scraper_failure("Galle", "Connection refused")
        mock_email.assert_called_once()
        assert "Galle" in mock_email.call_args[0][0]
        mock_db.assert_called_once()
        assert mock_db.call_args[1]["actual_count"] == 0 or mock_db.call_args[0][3] == "Connection refused"

    def test_alert_zero_vessels_sends_email_and_logs(self):
        with patch.object(alerting, "send_email_alert") as mock_email, \
             patch.object(alerting, "_log_alert_to_db") as mock_db:
            alerting.alert_zero_vessels("Galle", 25)
        mock_email.assert_called_once()
        assert "0 vessels" in mock_email.call_args[0][0]
        mock_db.assert_called_once()

    def test_alert_vessel_count_drop_sends_email_and_logs(self):
        with patch.object(alerting, "send_email_alert") as mock_email, \
             patch.object(alerting, "_log_alert_to_db") as mock_db:
            alerting.alert_vessel_count_drop("GTS Schepen", 12, 140)
        mock_email.assert_called_once()
        subject = mock_email.call_args[0][0]
        assert "Circuit breaker" in subject
        assert "12" in subject
        assert "140" in subject
        mock_db.assert_called_once()


class TestResolveOpenAlerts:
    def test_resolves_and_sends_recovery_email(self):
        mock_sb = _make_mock_supabase()
        # select returns open alerts
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            _FakeResponse(data=[
                {"id": "alert-1", "error_type": "zero_vessels"},
                {"id": "alert-2", "error_type": "count_drop"},
            ])
        )
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = _FakeResponse()
        with patch.object(alerting, "supabase", mock_sb), \
             patch.object(alerting, "send_email_alert") as mock_email:
            alerting.resolve_open_alerts("galle")
        # Should update both alerts
        assert mock_sb.table.return_value.update.call_count == 2
        # Should send recovery email
        mock_email.assert_called_once()
        assert "recovered" in mock_email.call_args[0][0]

    def test_does_nothing_when_no_open_alerts(self):
        mock_sb = _make_mock_supabase()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            _FakeResponse(data=[])
        )
        with patch.object(alerting, "supabase", mock_sb), \
             patch.object(alerting, "send_email_alert") as mock_email:
            alerting.resolve_open_alerts("galle")
        mock_sb.table.return_value.update.assert_not_called()
        mock_email.assert_not_called()

    def test_swallows_exceptions(self):
        mock_sb = _make_mock_supabase()
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.side_effect = Exception("DB down")
        with patch.object(alerting, "supabase", mock_sb):
            alerting.resolve_open_alerts("galle")


class TestBuildAlertHtml:
    def test_includes_title_and_details(self):
        html = alerting._build_alert_html(
            title="Test Alert",
            severity="critical",
            details=["Detail 1", "Detail 2"],
        )
        assert "Test Alert" in html
        assert "Detail 1" in html
        assert "Detail 2" in html
        assert "#ef4444" in html  # critical color

    def test_includes_causes_when_provided(self):
        html = alerting._build_alert_html(
            title="Test",
            severity="warning",
            details=["Detail"],
            causes=["Cause A", "Cause B"],
        )
        assert "Cause A" in html
        assert "Cause B" in html
        assert "Possible causes" in html

    def test_no_causes_section_when_none(self):
        html = alerting._build_alert_html(
            title="Test",
            severity="success",
            details=["Detail"],
        )
        assert "Possible causes" not in html
        assert "#059669" in html  # success color
