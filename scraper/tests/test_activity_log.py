from unittest.mock import MagicMock, patch, call

import db


class _FakeInsertResponse:
    def __init__(self, data=None):
        self.data = data or [{"id": "new-uuid"}]


class _FakeSelectResponse:
    def __init__(self, data=None):
        self.data = data


def _make_mock_supabase():
    mock = MagicMock()
    # Default: activity_log insert succeeds
    mock.table.return_value.insert.return_value.execute.return_value = _FakeInsertResponse()
    return mock


class TestLogActivity:
    def test_inserts_correct_row(self):
        mock_sb = _make_mock_supabase()
        with patch.object(db, "supabase", mock_sb):
            db._log_activity(
                vessel_id="v1",
                event_type="inserted",
                vessel_name="MS Test",
                vessel_source="galle",
                new_price=500000,
            )
        mock_sb.table.assert_called_with("activity_log")
        inserted = mock_sb.table.return_value.insert.call_args[0][0]
        assert inserted["vessel_id"] == "v1"
        assert inserted["event_type"] == "inserted"
        assert inserted["vessel_name"] == "MS Test"
        assert inserted["vessel_source"] == "galle"
        assert inserted["old_price"] is None
        assert inserted["new_price"] == 500000

    def test_swallows_exceptions(self):
        mock_sb = _make_mock_supabase()
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception("DB down")
        with patch.object(db, "supabase", mock_sb):
            # Should not raise
            db._log_activity(
                vessel_id="v1",
                event_type="inserted",
                vessel_name="MS Test",
                vessel_source="galle",
            )

    def test_price_changed_includes_both_prices(self):
        mock_sb = _make_mock_supabase()
        with patch.object(db, "supabase", mock_sb):
            db._log_activity(
                vessel_id="v2",
                event_type="price_changed",
                vessel_name="MS Cargo",
                vessel_source="rensendriessen",
                old_price=400000,
                new_price=350000,
            )
        inserted = mock_sb.table.return_value.insert.call_args[0][0]
        assert inserted["old_price"] == 400000
        assert inserted["new_price"] == 350000


class TestUpsertVesselLogsActivity:
    def _setup_mock_for_insert(self, mock_sb):
        """Configure mock so upsert_vessel does an INSERT path."""
        # select returns no existing vessel
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            _FakeSelectResponse(data=[])
        )
        # insert returns new vessel with id
        mock_sb.table.return_value.insert.return_value.execute.return_value = _FakeInsertResponse(
            [{"id": "new-vessel-id"}]
        )

    def _setup_mock_for_price_change(self, mock_sb, old_price=500000):
        """Configure mock so upsert_vessel does a price_changed path."""
        # select returns existing vessel
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            _FakeSelectResponse(data=[{"id": "existing-id", "price": old_price}])
        )
        # update succeeds
        mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            _FakeSelectResponse(data=[])
        )

    def test_logs_activity_on_insert(self):
        mock_sb = _make_mock_supabase()
        self._setup_mock_for_insert(mock_sb)
        with patch.object(db, "supabase", mock_sb), patch.object(db, "_log_activity") as mock_log:
            result = db.upsert_vessel({
                "source": "galle",
                "source_id": "123",
                "name": "MS Nieuw",
                "price": 600000,
            })
        assert result == "inserted"
        mock_log.assert_called_once_with(
            vessel_id="new-vessel-id",
            event_type="inserted",
            vessel_name="MS Nieuw",
            vessel_source="galle",
            new_price=600000,
        )

    def test_logs_activity_on_price_change(self):
        mock_sb = _make_mock_supabase()
        self._setup_mock_for_price_change(mock_sb, old_price=500000)
        with patch.object(db, "supabase", mock_sb), patch.object(db, "_log_activity") as mock_log:
            result = db.upsert_vessel({
                "source": "rensendriessen",
                "source_id": "456",
                "name": "MS Prijs",
                "price": 450000,
            })
        assert result == "price_changed"
        mock_log.assert_called_once_with(
            vessel_id="existing-id",
            event_type="price_changed",
            vessel_name="MS Prijs",
            vessel_source="rensendriessen",
            old_price=500000,
            new_price=450000,
        )


class TestMarkRemovedLogsActivity:
    def test_logs_activity_for_each_removed_vessel(self):
        mock_sb = _make_mock_supabase()
        removed_vessels = [
            {"id": "r1", "name": "MS Gone", "price": 300000},
            {"id": "r2", "name": "MS Also Gone", "price": None},
        ]
        mock_sb.table.return_value.update.return_value.eq.return_value.eq.return_value.lt.return_value.execute.return_value = (
            _FakeSelectResponse(data=removed_vessels)
        )
        with patch.object(db, "supabase", mock_sb), patch.object(db, "_log_activity") as mock_log:
            db.clear_changes()
            count = db.mark_removed("galle", "2025-01-01T00:00:00Z")
        assert count == 2
        assert mock_log.call_count == 2
        mock_log.assert_any_call(
            vessel_id="r1",
            event_type="removed",
            vessel_name="MS Gone",
            vessel_source="galle",
            old_price=300000,
        )
        mock_log.assert_any_call(
            vessel_id="r2",
            event_type="removed",
            vessel_name="MS Also Gone",
            vessel_source="galle",
            old_price=None,
        )
