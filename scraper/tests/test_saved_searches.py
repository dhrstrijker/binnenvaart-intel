"""Tests for saved search matching and digest email functionality."""

import unittest
from unittest.mock import MagicMock, patch

from notifications import get_saved_search_matches, build_digest_email, send_digest


class TestSavedSearchMatches(unittest.TestCase):
    """Test saved search filtering logic."""

    def setUp(self):
        """Set up test vessels and changes."""
        self.changes = [
            {
                "kind": "price_changed",
                "vessel": {
                    "id": "v1",
                    "name": "De Hoop",
                    "type": "Tankschip",
                    "source": "rensendriessen",
                    "price": 150000,
                },
                "new_price": 150000,
            },
            {
                "kind": "inserted",
                "vessel": {
                    "id": "v2",
                    "name": "Amstel",
                    "type": "Duw/Sleepboot",
                    "source": "galle",
                    "price": 200000,
                },
            },
            {
                "kind": "removed",
                "vessel": {
                    "id": "v3",
                    "name": "Rotterdam",
                    "type": "Tankschip",
                    "source": "pcshipbrokers",
                    "price": 100000,
                },
            },
            {
                "kind": "price_changed",
                "vessel": {
                    "id": "v4",
                    "name": "Groningen",
                    "type": "Beunschip",
                    "source": "rensendriessen",
                    "price": 250000,
                },
                "new_price": 250000,
            },
        ]

    def test_get_saved_search_matches_type_filter(self):
        """Test that type filter works correctly."""
        search = {"filters": {"type": "Tankschip"}}
        matches = get_saved_search_matches(search, self.changes)
        self.assertEqual(len(matches), 2)
        self.assertTrue(all(m["vessel"]["type"] == "Tankschip" for m in matches))

    def test_get_saved_search_matches_price_range(self):
        """Test that min/max price filters work."""
        search = {"filters": {"minPrice": "150000", "maxPrice": "200000"}}
        matches = get_saved_search_matches(search, self.changes)
        self.assertEqual(len(matches), 2)
        for m in matches:
            price = m["vessel"]["price"]
            self.assertGreaterEqual(price, 150000)
            self.assertLessEqual(price, 200000)

    def test_get_saved_search_matches_source_filter(self):
        """Test that source filter works."""
        search = {"filters": {"source": "rensendriessen"}}
        matches = get_saved_search_matches(search, self.changes)
        self.assertEqual(len(matches), 2)
        self.assertTrue(all(m["vessel"]["source"] == "rensendriessen" for m in matches))

    def test_get_saved_search_matches_name_search(self):
        """Test that name search works (case-insensitive)."""
        search = {"filters": {"search": "hoop"}}
        matches = get_saved_search_matches(search, self.changes)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["vessel"]["name"], "De Hoop")

    def test_get_saved_search_matches_no_filters(self):
        """Test that no filters returns all changes."""
        search = {"filters": {}}
        matches = get_saved_search_matches(search, self.changes)
        self.assertEqual(len(matches), 4)

    def test_get_saved_search_matches_combined_filters(self):
        """Test multiple filters combined."""
        search = {
            "filters": {
                "type": "Tankschip",
                "minPrice": "120000",
                "source": "rensendriessen",
            }
        }
        matches = get_saved_search_matches(search, self.changes)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["vessel"]["name"], "De Hoop")


class TestDigestEmail(unittest.TestCase):
    """Test digest email generation."""

    def test_build_digest_email(self):
        """Test that digest email contains vessel info."""
        subscriber = {
            "email": "test@example.com",
            "unsubscribe_token": "token123",
        }
        matches = [
            {
                "kind": "price_changed",
                "vessel": {
                    "id": "v1",
                    "name": "De Hoop",
                    "type": "Tankschip",
                    "source": "rensendriessen",
                    "price": 150000,
                    "url": "https://example.com/vessel1",
                },
                "old_price": 140000,
                "new_price": 150000,
            }
        ]
        html = build_digest_email(subscriber, matches, "Dagelijkse")

        # Verify email structure
        self.assertIn("NAVISIO", html)
        self.assertIn("Dagelijkse Samenvatting", html)
        self.assertIn("De Hoop", html)
        self.assertIn("Tankschip", html)
        self.assertIn("Prijswijzigingen (1)", html)
        self.assertIn("token123", html)


class TestSendDigest(unittest.TestCase):
    """Test digest sending logic."""

    @patch("notifications.resend")
    @patch("db.get_subscribers_with_frequency")
    @patch("db.get_changes_since")
    @patch("db.get_user_watchlist_vessel_ids")
    @patch("db.get_user_saved_searches")
    @patch("db.save_notification_history")
    def test_send_digest_skips_empty(
        self,
        mock_save_history,
        mock_saved_searches,
        mock_watchlist,
        mock_changes,
        mock_subscribers,
        mock_resend,
    ):
        """Test that no email is sent when no matches."""
        mock_resend.api_key = "test_key"
        mock_changes.return_value = []

        send_digest("daily")

        # No emails should be sent
        mock_resend.Emails.send.assert_not_called()

    @patch("notifications.resend")
    @patch("db.get_subscribers_with_frequency")
    @patch("db.get_changes_since")
    @patch("db.get_user_watchlist_vessel_ids")
    @patch("db.get_user_saved_searches")
    @patch("db.save_notification_history")
    def test_send_digest_with_watchlist_match(
        self,
        mock_save_history,
        mock_saved_searches,
        mock_watchlist,
        mock_changes,
        mock_subscribers,
        mock_resend,
    ):
        """Test digest sends email when watchlist matches exist."""
        mock_resend.api_key = "test_key"
        mock_resend.Emails.send.return_value = {"id": "msg_123"}

        mock_subscribers.return_value = [
            {
                "user_id": "u1",
                "email": "test@example.com",
                "unsubscribe_token": "token123",
            }
        ]

        mock_changes.return_value = [
            {
                "kind": "price_changed",
                "vessel": {
                    "id": "v1",
                    "name": "De Hoop",
                    "type": "Tankschip",
                    "source": "rensendriessen",
                    "price": 150000,
                    "url": "https://example.com/vessel1",
                },
                "new_price": 150000,
            }
        ]

        mock_watchlist.return_value = ["v1"]
        mock_saved_searches.return_value = []

        send_digest("daily")

        # One email should be sent
        mock_resend.Emails.send.assert_called_once()
        call_args = mock_resend.Emails.send.call_args[0][0]
        self.assertEqual(call_args["to"], "test@example.com")
        self.assertIn("Dagelijkse samenvatting", call_args["subject"])

    @patch("notifications.resend")
    @patch("db.get_subscribers_with_frequency")
    @patch("db.get_changes_since")
    @patch("db.get_user_watchlist_vessel_ids")
    @patch("db.get_user_saved_searches")
    @patch("db.save_notification_history")
    def test_send_digest_with_saved_search_match(
        self,
        mock_save_history,
        mock_saved_searches,
        mock_watchlist,
        mock_changes,
        mock_subscribers,
        mock_resend,
    ):
        """Test digest sends email when saved search matches exist."""
        mock_resend.api_key = "test_key"
        mock_resend.Emails.send.return_value = {"id": "msg_123"}

        mock_subscribers.return_value = [
            {
                "user_id": "u1",
                "email": "test@example.com",
                "unsubscribe_token": "token123",
            }
        ]

        mock_changes.return_value = [
            {
                "kind": "price_changed",
                "vessel": {
                    "id": "v1",
                    "name": "De Hoop",
                    "type": "Tankschip",
                    "source": "rensendriessen",
                    "price": 150000,
                    "url": "https://example.com/vessel1",
                },
                "new_price": 150000,
            }
        ]

        mock_watchlist.return_value = []
        mock_saved_searches.return_value = [
            {"filters": {"type": "Tankschip"}, "frequency": "daily"}
        ]

        send_digest("daily")

        # One email should be sent
        mock_resend.Emails.send.assert_called_once()
        call_args = mock_resend.Emails.send.call_args[0][0]
        self.assertIn("1 wijziging", call_args["subject"])

    @patch("notifications.resend")
    @patch("db.get_subscribers_with_frequency")
    @patch("db.get_changes_since")
    @patch("db.get_user_watchlist_vessel_ids")
    @patch("db.get_user_saved_searches")
    @patch("db.save_notification_history")
    def test_send_digest_deduplicates_vessels(
        self,
        mock_save_history,
        mock_saved_searches,
        mock_watchlist,
        mock_changes,
        mock_subscribers,
        mock_resend,
    ):
        """Test that vessels matching both watchlist and saved search appear only once."""
        mock_resend.api_key = "test_key"
        mock_resend.Emails.send.return_value = {"id": "msg_123"}

        mock_subscribers.return_value = [
            {
                "user_id": "u1",
                "email": "test@example.com",
                "unsubscribe_token": "token123",
            }
        ]

        mock_changes.return_value = [
            {
                "kind": "price_changed",
                "vessel": {
                    "id": "v1",
                    "name": "De Hoop",
                    "type": "Tankschip",
                    "source": "rensendriessen",
                    "price": 150000,
                    "url": "https://example.com/vessel1",
                },
                "new_price": 150000,
            }
        ]

        # Same vessel in both watchlist and saved search
        mock_watchlist.return_value = ["v1"]
        mock_saved_searches.return_value = [
            {"filters": {"type": "Tankschip"}, "frequency": "daily"}
        ]

        send_digest("daily")

        # Email should contain only 1 vessel (deduplicated)
        mock_resend.Emails.send.assert_called_once()
        call_args = mock_resend.Emails.send.call_args[0][0]
        self.assertIn("1 wijziging", call_args["subject"])


if __name__ == "__main__":
    unittest.main()
