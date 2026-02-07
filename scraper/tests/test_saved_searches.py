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
                    "length_m": 65.0,
                    "width_m": 8.2,
                    "build_year": 1995,
                    "tonnage": 1200,
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
                    "length_m": 25.0,
                    "width_m": 6.5,
                    "build_year": 2010,
                    "tonnage": None,
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
                    "length_m": 80.0,
                    "width_m": 9.5,
                    "build_year": 1988,
                    "tonnage": 1800,
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
                    "length_m": 55.0,
                    "width_m": 7.8,
                    "build_year": 2005,
                    "tonnage": 950,
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

    def test_get_saved_search_matches_length_min(self):
        """Test that minLength filter works."""
        search = {"filters": {"minLength": "50"}}
        matches = get_saved_search_matches(search, self.changes)
        # v1=65, v3=80, v4=55 match (>=50); v2=25 does not
        self.assertEqual(len(matches), 3)
        names = {m["vessel"]["name"] for m in matches}
        self.assertIn("De Hoop", names)
        self.assertIn("Rotterdam", names)
        self.assertIn("Groningen", names)

    def test_get_saved_search_matches_length_max(self):
        """Test that maxLength filter works."""
        search = {"filters": {"maxLength": "60"}}
        matches = get_saved_search_matches(search, self.changes)
        # v2=25, v4=55 match (<=60); v1=65, v3=80 do not
        self.assertEqual(len(matches), 2)
        names = {m["vessel"]["name"] for m in matches}
        self.assertIn("Amstel", names)
        self.assertIn("Groningen", names)

    def test_get_saved_search_matches_length_range(self):
        """Test min+max length combined."""
        search = {"filters": {"minLength": "50", "maxLength": "70"}}
        matches = get_saved_search_matches(search, self.changes)
        # v1=65, v4=55 match (50-70)
        self.assertEqual(len(matches), 2)

    def test_get_saved_search_matches_width_min(self):
        """Test that minWidth filter works."""
        search = {"filters": {"minWidth": "8"}}
        matches = get_saved_search_matches(search, self.changes)
        # v1=8.2, v3=9.5 match; v2=6.5, v4=7.8 do not
        self.assertEqual(len(matches), 2)

    def test_get_saved_search_matches_width_max(self):
        """Test that maxWidth filter works."""
        search = {"filters": {"maxWidth": "7"}}
        matches = get_saved_search_matches(search, self.changes)
        # v2=6.5 matches; v1=8.2, v3=9.5, v4=7.8 do not
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["vessel"]["name"], "Amstel")

    def test_get_saved_search_matches_build_year_min(self):
        """Test that minBuildYear filter works."""
        search = {"filters": {"minBuildYear": "2000"}}
        matches = get_saved_search_matches(search, self.changes)
        # v2=2010, v4=2005 match; v1=1995, v3=1988 do not
        self.assertEqual(len(matches), 2)
        names = {m["vessel"]["name"] for m in matches}
        self.assertIn("Amstel", names)
        self.assertIn("Groningen", names)

    def test_get_saved_search_matches_build_year_max(self):
        """Test that maxBuildYear filter works."""
        search = {"filters": {"maxBuildYear": "1995"}}
        matches = get_saved_search_matches(search, self.changes)
        # v1=1995, v3=1988 match; v2=2010, v4=2005 do not
        self.assertEqual(len(matches), 2)
        names = {m["vessel"]["name"] for m in matches}
        self.assertIn("De Hoop", names)
        self.assertIn("Rotterdam", names)

    def test_get_saved_search_matches_tonnage_min(self):
        """Test that minTonnage filter works."""
        search = {"filters": {"minTonnage": "1000"}}
        matches = get_saved_search_matches(search, self.changes)
        # v1=1200, v3=1800 match; v2=None(=0), v4=950 do not
        self.assertEqual(len(matches), 2)

    def test_get_saved_search_matches_tonnage_max(self):
        """Test that maxTonnage filter works."""
        search = {"filters": {"maxTonnage": "1000"}}
        matches = get_saved_search_matches(search, self.changes)
        # v4=950 matches; v1=1200, v3=1800 do not; v2=None treated as inf
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["vessel"]["name"], "Groningen")

    def test_get_saved_search_matches_combined_new_and_existing(self):
        """Test combining new filters (length, build_year) with existing ones (type, price)."""
        search = {
            "filters": {
                "type": "Tankschip",
                "minPrice": "100000",
                "minLength": "70",
                "minBuildYear": "1985",
                "maxBuildYear": "1995",
            }
        }
        matches = get_saved_search_matches(search, self.changes)
        # Must be Tankschip, price>=100k, length>=70, build_year 1985-1995
        # v1: Tankschip, 150k, 65m (fails length)
        # v3: Tankschip, 100k, 80m, 1988 (passes all)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["vessel"]["name"], "Rotterdam")


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

        mock_watchlist.return_value = {"v1": {"notify_price_change": True, "notify_status_change": True}}
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

        mock_watchlist.return_value = {}
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
        mock_watchlist.return_value = {"v1": {"notify_price_change": True, "notify_status_change": True}}
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
