"""Tests for vessel type normalization in db.normalize_type."""

import pytest
from db import normalize_type, TYPE_MAP


class TestNormalizeType:
    """normalize_type() maps raw scraper types to canonical names."""

    # --- Tanker variants all map to "Tankschip" ---

    def test_tanker_to_tankschip(self):
        assert normalize_type("Tanker") == "Tankschip"

    def test_motortankschip_to_tankschip(self):
        assert normalize_type("Motortankschip") == "Tankschip"

    def test_tankschip_stays_tankschip(self):
        assert normalize_type("Tankschip") == "Tankschip"

    # --- Tug variants all map to "Duw/Sleepboot" ---

    def test_sleepboot_to_duw_sleepboot(self):
        assert normalize_type("Sleepboot") == "Duw/Sleepboot"

    def test_duwboot_to_duw_sleepboot(self):
        assert normalize_type("Duwboot") == "Duw/Sleepboot"

    def test_duw_sleepboot_stays(self):
        assert normalize_type("Duw/Sleepboot") == "Duw/Sleepboot"

    # --- Case-insensitive matching ---

    def test_lowercase_tanker(self):
        assert normalize_type("tanker") == "Tankschip"

    def test_uppercase_tanker(self):
        assert normalize_type("TANKER") == "Tankschip"

    def test_mixed_case_motortankschip(self):
        assert normalize_type("motorTankschip") == "Tankschip"

    # --- Whitespace handling ---

    def test_leading_trailing_spaces(self):
        assert normalize_type("  Tanker  ") == "Tankschip"

    def test_spaces_around_sleepboot(self):
        assert normalize_type(" Sleepboot ") == "Duw/Sleepboot"

    # --- Passthrough: unmapped types returned unchanged ---

    def test_motorvrachtschip_unchanged(self):
        assert normalize_type("Motorvrachtschip") == "Motorvrachtschip"

    def test_beunschip_unchanged(self):
        assert normalize_type("Beunschip") == "Beunschip"

    def test_duwbak_unchanged(self):
        assert normalize_type("Duwbak") == "Duwbak"

    def test_koppelverband_unchanged(self):
        assert normalize_type("Koppelverband") == "Koppelverband"

    def test_passagiersschip_unchanged(self):
        assert normalize_type("Passagiersschip") == "Passagiersschip"

    # --- None handling ---

    def test_none_returns_none(self):
        assert normalize_type(None) is None

    # --- TYPE_MAP completeness guard ---

    def test_type_map_has_tanker_entries(self):
        lower_keys = set(TYPE_MAP.keys())
        assert "tanker" in lower_keys
        assert "motortankschip" in lower_keys

    def test_type_map_has_tug_entries(self):
        lower_keys = set(TYPE_MAP.keys())
        assert "sleepboot" in lower_keys
        assert "duwboot" in lower_keys

    def test_all_map_values_are_known_canonical_types(self):
        expected = {
            "Tankschip", "Duw/Sleepboot", "Duwbak", "Koppelverband",
            "Beunschip", "Jacht", "Woonschip", "Passagiersschip", "Nieuwbouw",
        }
        assert set(TYPE_MAP.values()) == expected
