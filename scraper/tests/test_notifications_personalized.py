from unittest.mock import patch

from notifications import (
    build_personalized_email,
    build_personalized_subject,
    build_verification_html,
    filter_changes_for_user,
    send_personalized_notifications,
)


def _make_change(kind="inserted", vessel_id="v1", name="Test Vessel", price=100000):
    """Helper to build a change dict."""
    change = {
        "kind": kind,
        "vessel": {
            "id": vessel_id,
            "name": name,
            "type": "Motorvrachtschip",
            "length_m": 80.0,
            "url": "https://example.com/v1",
            "source": "test",
            "price": price,
        },
    }
    if kind == "price_changed":
        change["old_price"] = price
        change["new_price"] = price + 10000
    return change


def _make_subscriber(**overrides):
    base = {
        "user_id": "user-1",
        "email": "test@example.com",
        "preferences": {"types": ["new", "price_change", "removed"]},
        "unsubscribe_token": "tok-abc123",
    }
    base.update(overrides)
    return base


class TestFilterChangesForUser:
    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": True, "notify_status_change": True},
        "v2": {"notify_price_change": True, "notify_status_change": True},
    })
    def test_watchlist_only(self, mock_wl):
        """Only vessels on the user's watchlist are returned."""
        changes = [
            _make_change(vessel_id="v1"),
            _make_change(vessel_id="v3"),
            _make_change(vessel_id="v2"),
        ]
        result = filter_changes_for_user(_make_subscriber(), changes)
        assert len(result) == 2
        ids = {c["vessel"]["id"] for c in result}
        assert ids == {"v1", "v2"}

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": True, "notify_status_change": True},
        "v2": {"notify_price_change": True, "notify_status_change": True},
    })
    def test_respects_preferences(self, mock_wl):
        """Preference types filter restricts which change kinds are included."""
        changes = [
            _make_change(kind="inserted", vessel_id="v1"),
            _make_change(kind="price_changed", vessel_id="v2"),
            _make_change(kind="removed", vessel_id="v1"),
        ]
        sub = _make_subscriber(preferences={"types": ["price_change"]})
        result = filter_changes_for_user(sub, changes)
        assert len(result) == 1
        assert result[0]["kind"] == "price_changed"

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": True, "notify_status_change": True},
    })
    def test_legacy_boolean_preferences_are_supported(self, mock_wl):
        """Legacy bool preference shape maps to canonical notification types."""
        changes = [
            _make_change(kind="inserted", vessel_id="v1"),
            _make_change(kind="price_changed", vessel_id="v1"),
            _make_change(kind="removed", vessel_id="v1"),
        ]
        sub = _make_subscriber(
            preferences={"new_vessels": False, "price_changes": True, "removed_vessels": False}
        )
        result = filter_changes_for_user(sub, changes)
        assert len(result) == 1
        assert result[0]["kind"] == "price_changed"

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": True, "notify_status_change": True},
    })
    def test_empty_types_disables_all_notification_kinds(self, mock_wl):
        changes = [
            _make_change(kind="inserted", vessel_id="v1"),
            _make_change(kind="price_changed", vessel_id="v1"),
            _make_change(kind="removed", vessel_id="v1"),
        ]
        sub = _make_subscriber(preferences={"types": []})
        result = filter_changes_for_user(sub, changes)
        assert result == []

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={})
    def test_empty_watchlist(self, mock_wl):
        """Empty watchlist means no changes returned."""
        changes = [_make_change(vessel_id="v1")]
        result = filter_changes_for_user(_make_subscriber(), changes)
        assert result == []

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": False, "notify_status_change": True},
        "v2": {"notify_price_change": True, "notify_status_change": True},
    })
    def test_per_vessel_price_flag_false_blocks_price_change(self, mock_wl):
        """notify_price_change=False blocks price_changed for that vessel."""
        changes = [
            _make_change(kind="price_changed", vessel_id="v1"),
            _make_change(kind="price_changed", vessel_id="v2"),
        ]
        result = filter_changes_for_user(_make_subscriber(), changes)
        assert len(result) == 1
        assert result[0]["vessel"]["id"] == "v2"

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": True, "notify_status_change": False},
    })
    def test_per_vessel_status_flag_false_blocks_removed(self, mock_wl):
        """notify_status_change=False blocks removed events for that vessel."""
        changes = [_make_change(kind="removed", vessel_id="v1")]
        result = filter_changes_for_user(_make_subscriber(), changes)
        assert result == []

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": True, "notify_status_change": False},
    })
    def test_per_vessel_status_flag_false_blocks_sold(self, mock_wl):
        """notify_status_change=False blocks sold events for that vessel."""
        changes = [_make_change(kind="sold", vessel_id="v1")]
        result = filter_changes_for_user(_make_subscriber(), changes)
        assert result == []

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": False, "notify_status_change": False},
    })
    def test_both_flags_false_blocks_all_except_inserted(self, mock_wl):
        """Both flags False blocks price_changed and removed, but inserted passes."""
        changes = [
            _make_change(kind="inserted", vessel_id="v1"),
            _make_change(kind="price_changed", vessel_id="v1"),
            _make_change(kind="removed", vessel_id="v1"),
        ]
        result = filter_changes_for_user(_make_subscriber(), changes)
        assert len(result) == 1
        assert result[0]["kind"] == "inserted"

    @patch("notifications.get_user_watchlist_vessel_ids", return_value={
        "v1": {"notify_price_change": True, "notify_status_change": True},
    })
    def test_sold_kind_passes_with_removed_pref(self, mock_wl):
        """sold change passes when notify_status_change=True and removed in prefs."""
        changes = [_make_change(kind="sold", vessel_id="v1")]
        result = filter_changes_for_user(_make_subscriber(), changes)
        assert len(result) == 1
        assert result[0]["kind"] == "sold"


class TestBuildVerificationHtml:
    def test_contains_verification_url(self):
        url = "https://navisio.nl/api/verify-email?token=abc123"
        html = build_verification_html(url)
        assert url in html

    def test_contains_navisio_branding(self):
        html = build_verification_html("https://example.com/verify")
        assert "NAVISIO" in html


class TestBuildPersonalizedEmail:
    def test_contains_vessel_info(self):
        sub = _make_subscriber()
        changes = [_make_change(kind="inserted", name="MS Orion")]
        html = build_personalized_email(sub, changes)
        assert "MS Orion" in html
        assert "Nieuwe schepen" in html

    def test_contains_unsubscribe_link(self):
        sub = _make_subscriber(unsubscribe_token="tok-xyz")
        changes = [_make_change()]
        html = build_personalized_email(sub, changes)
        assert "tok-xyz" in html
        assert "Uitschrijven" in html

    def test_price_change_section(self):
        sub = _make_subscriber()
        changes = [_make_change(kind="price_changed", vessel_id="v1")]
        html = build_personalized_email(sub, changes)
        assert "Prijswijzigingen" in html

    def test_removed_section(self):
        sub = _make_subscriber()
        changes = [_make_change(kind="removed", vessel_id="v1")]
        html = build_personalized_email(sub, changes)
        assert "Verkocht" in html


class TestBuildPersonalizedSubject:
    def test_single_price_change(self):
        changes = [_make_change(kind="price_changed")]
        subject = build_personalized_subject(changes)
        assert "1 prijswijziging" in subject
        assert "meldingen" in subject

    def test_multiple_types(self):
        changes = [
            _make_change(kind="inserted"),
            _make_change(kind="price_changed"),
            _make_change(kind="removed"),
        ]
        subject = build_personalized_subject(changes)
        assert "1 prijswijziging" in subject
        assert "1 nieuw" in subject
        assert "1 verkocht" in subject

    def test_plural_new(self):
        changes = [
            _make_change(kind="inserted", vessel_id="v1"),
            _make_change(kind="inserted", vessel_id="v2"),
        ]
        subject = build_personalized_subject(changes)
        assert "2 nieuwe schepen" in subject

    def test_empty_changes_fallback(self):
        subject = build_personalized_subject([])
        assert "Wijzigingen" in subject


class TestSendPersonalizedNotifications:
    @patch("notifications.save_notification_history")
    @patch("notifications._get_saved_search_matches_deduped")
    @patch("notifications.filter_changes_for_user")
    @patch("notifications.get_verified_subscribers")
    @patch("notifications.resend")
    def test_saved_search_matches_trigger_send(
        self,
        mock_resend,
        mock_get_subscribers,
        mock_filter_watchlist,
        mock_saved_matches,
        mock_save_history,
    ):
        mock_resend.api_key = "test_key"
        mock_resend.Emails.send.return_value = {"id": "msg_123"}
        mock_get_subscribers.return_value = [
            _make_subscriber(user_id="user-1", email="test@example.com")
        ]
        mock_filter_watchlist.return_value = []
        mock_saved_matches.return_value = [_make_change(kind="inserted", vessel_id="v1")]

        send_personalized_notifications({"total": 1}, [_make_change(kind="inserted", vessel_id="v1")])

        mock_resend.Emails.send.assert_called_once()
        mock_save_history.assert_called_once()
        args = mock_save_history.call_args[0]
        assert args[2] == "watchlist_and_saved_searches"
