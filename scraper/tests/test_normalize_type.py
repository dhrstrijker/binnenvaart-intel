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

    def test_motor_tanker_to_tankschip(self):
        assert normalize_type("Motor Tanker") == "Tankschip"

    # --- Cargo variants map to "Motorvrachtschip" ---

    def test_dry_cargo_vessel_to_motorvrachtschip(self):
        assert normalize_type("Dry Cargo Vessel") == "Motorvrachtschip"

    # --- Tug variants all map to "Duw/Sleepboot" ---

    def test_sleepboot_to_duw_sleepboot(self):
        assert normalize_type("Sleepboot") == "Duw/Sleepboot"

    def test_duwboot_to_duw_sleepboot(self):
        assert normalize_type("Duwboot") == "Duw/Sleepboot"

    def test_duw_sleepboot_stays(self):
        assert normalize_type("Duw/Sleepboot") == "Duw/Sleepboot"

    def test_pusher_to_duw_sleepboot(self):
        assert normalize_type("Pusher") == "Duw/Sleepboot"

    # --- Barge variants ---

    def test_pushbarge_to_duwbak(self):
        assert normalize_type("Pushbarge") == "Duwbak"

    def test_push_barge_to_duwbak(self):
        assert normalize_type("Push Barge") == "Duwbak"

    # --- Koppelverband variants ---

    def test_push_combination_to_koppelverband(self):
        assert normalize_type("Push Combination") == "Koppelverband"

    # --- Beunschip variants ---

    def test_motorbeunschip_to_beunschip(self):
        assert normalize_type("Motorbeunschip") == "Beunschip"

    # --- Accomodatieschip variants ---

    def test_accomodatieschepen_to_accomodatieschip(self):
        assert normalize_type("Accomodatieschepen") == "Accomodatieschip"

    # --- Case-insensitive matching ---

    def test_lowercase_tanker(self):
        assert normalize_type("tanker") == "Tankschip"

    def test_uppercase_tanker(self):
        assert normalize_type("TANKER") == "Tankschip"

    def test_mixed_case_motortankschip(self):
        assert normalize_type("motorTankschip") == "Tankschip"

    def test_lowercase_motor_tanker(self):
        assert normalize_type("motor tanker") == "Tankschip"

    def test_uppercase_dry_cargo(self):
        assert normalize_type("DRY CARGO VESSEL") == "Motorvrachtschip"

    # --- Whitespace handling ---

    def test_leading_trailing_spaces(self):
        assert normalize_type("  Tanker  ") == "Tankschip"

    def test_spaces_around_sleepboot(self):
        assert normalize_type(" Sleepboot ") == "Duw/Sleepboot"

    # --- Self-mapped canonical types ---

    def test_motorvrachtschip_canonical(self):
        assert normalize_type("Motorvrachtschip") == "Motorvrachtschip"

    def test_beunschip_canonical(self):
        assert normalize_type("Beunschip") == "Beunschip"

    def test_duwbak_canonical(self):
        assert normalize_type("Duwbak") == "Duwbak"

    def test_koppelverband_canonical(self):
        assert normalize_type("Koppelverband") == "Koppelverband"

    def test_passagiersschip_canonical(self):
        assert normalize_type("Passagiersschip") == "Passagiersschip"

    def test_kraanschip_canonical(self):
        assert normalize_type("Kraanschip") == "Kraanschip"

    def test_ponton_canonical(self):
        assert normalize_type("Ponton") == "Ponton"

    def test_overige_canonical(self):
        assert normalize_type("Overige") == "Overige"

    def test_accomodatieschip_canonical(self):
        assert normalize_type("Accomodatieschip") == "Accomodatieschip"

    # --- None handling ---

    def test_none_returns_none(self):
        assert normalize_type(None) is None

    # --- TYPE_MAP completeness guard ---

    def test_type_map_has_tanker_entries(self):
        lower_keys = set(TYPE_MAP.keys())
        assert "tanker" in lower_keys
        assert "motortankschip" in lower_keys
        assert "motor tanker" in lower_keys

    def test_type_map_has_tug_entries(self):
        lower_keys = set(TYPE_MAP.keys())
        assert "sleepboot" in lower_keys
        assert "duwboot" in lower_keys
        assert "pusher" in lower_keys

    def test_type_map_has_cargo_entries(self):
        lower_keys = set(TYPE_MAP.keys())
        assert "dry cargo vessel" in lower_keys
        assert "motorvrachtschip" in lower_keys

    def test_all_map_values_are_known_canonical_types(self):
        expected = {
            "Motorvrachtschip", "Tankschip", "Duw/Sleepboot", "Duwbak",
            "Koppelverband", "Beunschip", "Jacht", "Woonschip",
            "Passagiersschip", "Nieuwbouw", "Kraanschip", "Ponton",
            "Overige", "Accomodatieschip",
        }
        assert set(TYPE_MAP.values()) == expected
