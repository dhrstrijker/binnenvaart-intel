from scrape_gsk import map_type, build_image_url, parse_vessel


def _make_vessel(overrides=None):
    """Build a sample GSK GraphQL vessel dict for testing."""
    base = {
        "id": "69844e25a49893e3ddaf2ae0",
        "legacyId": "6279264777273344",
        "vesselName": "Montana II",
        "slug": "montana-ii",
        "general": {
            "type": "PUSH_BARGE",
            "yearOfBuild": 1992,
            "price": 895000,
            "priceVisible": True,
            "priceDropped": None,
            "status": "FOR_SALE",
            "vesselDimensions": {"length": 92.12, "width": 11.49, "draft": 3.71},
            "tonnage": {"maxTonnage": 2480.23},
        },
        "gallery": [
            {"filename": "Montana 1.jpg"},
            {"filename": "MK 13.jpeg"},
        ],
        "technics": {
            "engines": [
                {"make": "Cummins", "power": 775, "powerType": "HP", "yearOfBuild": 2006}
            ]
        },
    }
    if overrides:
        for key, value in overrides.items():
            if isinstance(value, dict) and isinstance(base.get(key), dict):
                base[key].update(value)
            else:
                base[key] = value
    return base


class TestMapType:
    def test_push_barge(self):
        assert map_type("PUSH_BARGE") == "Duwbak"

    def test_push_boat(self):
        assert map_type("PUSH_BOAT") == "Duw/Sleepboot"

    def test_tonnage_variants_all_motorvrachtschip(self):
        for t in ("TONS_250_399", "TONS_400_499", "TONS_500_749",
                   "TONS_750_999", "TONS_1000_1499", "TONS_1500"):
            assert map_type(t) == "Motorvrachtschip", f"Failed for {t}"

    def test_tanker_types(self):
        assert map_type("TANKERS_9005_9995") == "Tankschip"
        assert map_type("CEMENT_TANKER") == "Tankschip"
        assert map_type("POWDER_TANKER") == "Tankschip"

    def test_other_types(self):
        assert map_type("YAUGHT") == "Jacht"
        assert map_type("HOUSEBOAT") == "Woonschip"
        assert map_type("DUMP_BARGE") == "Beunschip"
        assert map_type("BARGE") == "Koppelverband"
        assert map_type("TUG_105_195") == "Duw/Sleepboot"
        assert map_type("PASSENGER_SHIP") == "Passagiersschip"
        assert map_type("NEWLY_BUILD") == "Nieuwbouw"

    def test_none(self):
        assert map_type(None) is None

    def test_unknown_type(self):
        assert map_type("UNKNOWN_FUTURE_TYPE") is None


class TestBuildImageUrl:
    def test_standard(self):
        url = build_image_url("6279264777273344", "Montana 1.jpg")
        assert url == (
            "https://gskbrokers.imgix.net/vessels/6279264777273344"
            "/images/Montana 1.jpg?fit=crop&w=600&h=400"
        )

    def test_special_chars_in_filename(self):
        url = build_image_url("123", "photo (2).jpeg")
        assert "photo (2).jpeg" in url
        assert url.startswith("https://gskbrokers.imgix.net/vessels/123/images/")


class TestParseVessel:
    def test_basic_vessel(self):
        v = parse_vessel(_make_vessel())
        assert v["source"] == "gsk"
        assert v["source_id"] == "montana-ii"
        assert v["name"] == "Montana II"
        assert v["type"] == "Duwbak"
        assert v["length_m"] == 92.12
        assert v["width_m"] == 11.49
        assert v["build_year"] == 1992
        assert v["tonnage"] == 2480.23
        assert v["price"] == 895000.0
        assert v["url"] == "https://www.gskbrokers.eu/nl/schip/montana-ii"

    def test_image_url(self):
        v = parse_vessel(_make_vessel())
        assert v["image_url"] == (
            "https://gskbrokers.imgix.net/vessels/6279264777273344"
            "/images/Montana 1.jpg?fit=crop&w=600&h=400"
        )

    def test_image_urls_list(self):
        v = parse_vessel(_make_vessel())
        assert len(v["image_urls"]) == 2
        assert "Montana 1.jpg" in v["image_urls"][0]
        assert "MK 13.jpeg" in v["image_urls"][1]

    def test_not_for_sale_skipped(self):
        v = parse_vessel(_make_vessel({"general": {"status": "SOLD"}}))
        assert v is None

    def test_price_not_visible(self):
        v = parse_vessel(_make_vessel({"general": {"priceVisible": False}}))
        assert v["price"] is None

    def test_price_none(self):
        v = parse_vessel(_make_vessel({"general": {"price": None}}))
        assert v["price"] is None

    def test_no_gallery(self):
        v = parse_vessel(_make_vessel({"gallery": []}))
        assert v["image_url"] is None
        assert v["image_urls"] is None

    def test_no_tonnage(self):
        v = parse_vessel(_make_vessel({"general": {"tonnage": {"maxTonnage": None}}}))
        assert v["tonnage"] is None

    def test_no_dimensions(self):
        v = parse_vessel(_make_vessel({"general": {"vesselDimensions": {}}}))
        assert v["length_m"] is None
        assert v["width_m"] is None

    def test_raw_details_contains_engine(self):
        v = parse_vessel(_make_vessel())
        assert v["raw_details"] is not None
        assert "engines" in v["raw_details"]
        assert v["raw_details"]["engines"][0]["make"] == "Cummins"

    def test_raw_details_contains_draft(self):
        v = parse_vessel(_make_vessel())
        assert v["raw_details"]["draft"] == 3.71

    def test_raw_details_contains_gsk_type(self):
        v = parse_vessel(_make_vessel())
        assert v["raw_details"]["gsk_type"] == "PUSH_BARGE"

    def test_no_engines(self):
        v = parse_vessel(_make_vessel({"technics": {"engines": []}}))
        assert "engines" not in (v["raw_details"] or {})

    def test_no_slug_uses_id(self):
        vessel = _make_vessel({"slug": None})
        v = parse_vessel(vessel)
        assert v["source_id"] == "69844e25a49893e3ddaf2ae0"
        assert v["url"] is None

    def test_build_year_none(self):
        v = parse_vessel(_make_vessel({"general": {"yearOfBuild": None}}))
        assert v["build_year"] is None

    def test_price_dropped_in_raw_details(self):
        v = parse_vessel(_make_vessel({"general": {"priceDropped": True}}))
        assert v["raw_details"]["price_dropped"] is True

    def test_empty_name_skipped(self):
        v = parse_vessel(_make_vessel({"vesselName": ""}))
        assert v is None

    def test_none_name_skipped(self):
        v = parse_vessel(_make_vessel({"vesselName": None}))
        assert v is None

    def test_whitespace_name_skipped(self):
        v = parse_vessel(_make_vessel({"vesselName": "   "}))
        assert v is None
