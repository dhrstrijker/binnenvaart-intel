"""Tests for get_changes_since() combining price_history + activity_log."""

from unittest.mock import MagicMock, patch, call

import db


class _FakeResponse:
    def __init__(self, data=None):
        self.data = data or []


def _make_mock_supabase():
    mock = MagicMock()
    return mock


VESSEL_A = {
    "id": "v-aaa",
    "name": "MS Alpha",
    "type": "Motorvrachtschip",
    "source": "galle",
    "price": 500000,
    "url": "https://example.com/a",
    "length_m": 80,
    "width_m": 9,
    "build_year": 2000,
    "tonnage": 1200,
    "status": "active",
}

VESSEL_B = {
    "id": "v-bbb",
    "name": "MS Beta",
    "type": "Tankschip",
    "source": "rensendriessen",
    "price": 300000,
    "url": "https://example.com/b",
    "length_m": 60,
    "width_m": 7,
    "build_year": 1995,
    "tonnage": 800,
    "status": "removed",
}


def _setup_mock(mock_sb, price_data, activity_data, vessels_data):
    """Configure mock supabase to return specific data for the three queries."""
    # We need to track which table is being called to return different responses.
    # price_history, activity_log, and vessels are called in that order.
    call_count = {"n": 0}
    responses = [
        _FakeResponse(price_data),     # price_history
        _FakeResponse(activity_data),  # activity_log
        _FakeResponse(vessels_data),   # vessels
    ]

    original_table = mock_sb.table

    def table_side_effect(name):
        result = MagicMock()
        idx = call_count["n"]
        call_count["n"] += 1

        # Build a chainable mock that returns the correct response at .execute()
        chain = result
        for _ in range(10):  # enough depth for any chain
            chain.select.return_value = chain
            chain.gte.return_value = chain
            chain.in_.return_value = chain
            chain.order.return_value = chain
            chain.execute.return_value = responses[min(idx, len(responses) - 1)]
        return result

    mock_sb.table.side_effect = table_side_effect


class TestGetChangesSince:
    def test_returns_price_changed_from_price_history(self):
        mock_sb = _make_mock_supabase()
        _setup_mock(
            mock_sb,
            price_data=[{"vessel_id": "v-aaa", "price": 480000, "recorded_at": "2025-01-01T10:00:00Z"}],
            activity_data=[],
            vessels_data=[VESSEL_A],
        )
        with patch.object(db, "supabase", mock_sb):
            changes = db.get_changes_since("2025-01-01T00:00:00Z")

        assert len(changes) == 1
        assert changes[0]["kind"] == "price_changed"
        assert changes[0]["vessel"]["id"] == "v-aaa"
        assert changes[0]["new_price"] == 480000

    def test_returns_inserted_from_activity_log(self):
        mock_sb = _make_mock_supabase()
        _setup_mock(
            mock_sb,
            price_data=[],
            activity_data=[
                {"vessel_id": "v-aaa", "event_type": "inserted", "old_price": None, "new_price": 500000, "recorded_at": "2025-01-01T08:00:00Z"},
            ],
            vessels_data=[VESSEL_A],
        )
        with patch.object(db, "supabase", mock_sb):
            changes = db.get_changes_since("2025-01-01T00:00:00Z")

        assert len(changes) == 1
        assert changes[0]["kind"] == "inserted"
        assert changes[0]["vessel"]["id"] == "v-aaa"
        assert changes[0]["new_price"] == 500000

    def test_returns_removed_from_activity_log(self):
        mock_sb = _make_mock_supabase()
        _setup_mock(
            mock_sb,
            price_data=[],
            activity_data=[
                {"vessel_id": "v-bbb", "event_type": "removed", "old_price": 300000, "new_price": None, "recorded_at": "2025-01-01T09:00:00Z"},
            ],
            vessels_data=[VESSEL_B],
        )
        with patch.object(db, "supabase", mock_sb):
            changes = db.get_changes_since("2025-01-01T00:00:00Z")

        assert len(changes) == 1
        assert changes[0]["kind"] == "removed"
        assert changes[0]["vessel"]["id"] == "v-bbb"
        assert changes[0]["old_price"] == 300000

    def test_returns_sold_from_activity_log(self):
        mock_sb = _make_mock_supabase()
        _setup_mock(
            mock_sb,
            price_data=[],
            activity_data=[
                {"vessel_id": "v-bbb", "event_type": "sold", "old_price": 300000, "new_price": None, "recorded_at": "2025-01-01T11:00:00Z"},
            ],
            vessels_data=[VESSEL_B],
        )
        with patch.object(db, "supabase", mock_sb):
            changes = db.get_changes_since("2025-01-01T00:00:00Z")

        assert len(changes) == 1
        assert changes[0]["kind"] == "sold"

    def test_combines_price_and_activity_sorted(self):
        mock_sb = _make_mock_supabase()
        _setup_mock(
            mock_sb,
            price_data=[
                {"vessel_id": "v-aaa", "price": 480000, "recorded_at": "2025-01-01T10:00:00Z"},
            ],
            activity_data=[
                {"vessel_id": "v-bbb", "event_type": "inserted", "old_price": None, "new_price": 300000, "recorded_at": "2025-01-01T08:00:00Z"},
                {"vessel_id": "v-aaa", "event_type": "removed", "old_price": 500000, "new_price": None, "recorded_at": "2025-01-01T12:00:00Z"},
            ],
            vessels_data=[VESSEL_A, VESSEL_B],
        )
        with patch.object(db, "supabase", mock_sb):
            changes = db.get_changes_since("2025-01-01T00:00:00Z")

        assert len(changes) == 3
        # Should be sorted by recorded_at
        assert changes[0]["kind"] == "inserted"  # 08:00
        assert changes[1]["kind"] == "price_changed"  # 10:00
        assert changes[2]["kind"] == "removed"  # 12:00

    def test_returns_empty_when_no_data(self):
        mock_sb = _make_mock_supabase()
        _setup_mock(
            mock_sb,
            price_data=[],
            activity_data=[],
            vessels_data=[],
        )
        with patch.object(db, "supabase", mock_sb):
            changes = db.get_changes_since("2025-01-01T00:00:00Z")

        assert changes == []

    def test_skips_entries_with_missing_vessels(self):
        mock_sb = _make_mock_supabase()
        _setup_mock(
            mock_sb,
            price_data=[
                {"vessel_id": "v-aaa", "price": 480000, "recorded_at": "2025-01-01T10:00:00Z"},
                {"vessel_id": "v-missing", "price": 100000, "recorded_at": "2025-01-01T11:00:00Z"},
            ],
            activity_data=[],
            vessels_data=[VESSEL_A],  # v-missing not in vessel data
        )
        with patch.object(db, "supabase", mock_sb):
            changes = db.get_changes_since("2025-01-01T00:00:00Z")

        assert len(changes) == 1
        assert changes[0]["vessel"]["id"] == "v-aaa"
