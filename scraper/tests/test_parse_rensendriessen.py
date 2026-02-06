from scrape_rensendriessen import parse_dimension, parse_vessel


class TestParseDimension:
    def test_meters_with_comma(self):
        assert parse_dimension("110,00m") == 110.0

    def test_meters_with_dot(self):
        assert parse_dimension("110.00m") == 110.0

    def test_plain_float(self):
        assert parse_dimension(110.0) == 110.0

    def test_plain_int(self):
        assert parse_dimension(85) == 85.0

    def test_none(self):
        assert parse_dimension(None) is None

    def test_empty_string(self):
        assert parse_dimension("") is None

    def test_non_numeric(self):
        assert parse_dimension("abc") is None

    def test_whitespace(self):
        assert parse_dimension("  110,00m  ") == 110.0


class TestParseVessel:
    def _make_ship(self, **overrides):
        base = {
            "ship_id": 1234,
            "shipname": "Test Ship",
            "ship_type": "Motortankschip",
            "ship_length": "110,00m",
            "ship_width": "11,45m",
            "build_year": 2020,
            "sales_asking_price": "5000000",
            "hide_price": False,
            "images": [
                {"original": "https://example.com/img1.jpg", "thumbnail": "https://example.com/thumb1.jpg", "sorting_no": 1},
                {"original": "https://example.com/img2.jpg", "thumbnail": "https://example.com/thumb2.jpg", "sorting_no": 2},
            ],
        }
        base.update(overrides)
        return base

    def test_basic_fields(self):
        result = parse_vessel(self._make_ship())
        assert result["source"] == "rensendriessen"
        assert result["source_id"] == "1234"
        assert result["name"] == "Test Ship"
        assert result["type"] == "Motortankschip"
        assert result["length_m"] == 110.0
        assert result["width_m"] == 11.45
        assert result["build_year"] == 2020
        assert result["price"] == 5000000.0
        assert result["url"] == "https://rensendriessen.com/aanbod/1234"
        assert result["image_url"] == "https://example.com/img1.jpg"

    def test_hidden_price(self):
        result = parse_vessel(self._make_ship(hide_price=True))
        assert result["price"] is None

    def test_no_images(self):
        result = parse_vessel(self._make_ship(images=[]))
        assert result["image_url"] is None
        assert result["image_urls"] is None

    def test_raw_details_excludes_images_and_bin(self):
        ship = self._make_ship(bin_field="excluded", bin_other="also excluded", engine_hp=500)
        result = parse_vessel(ship)
        assert "images" not in result["raw_details"]
        assert "bin_field" not in result["raw_details"]
        assert "bin_other" not in result["raw_details"]
        assert result["raw_details"]["engine_hp"] == 500
        assert result["raw_details"]["shipname"] == "Test Ship"

    def test_image_urls_structure(self):
        result = parse_vessel(self._make_ship())
        assert len(result["image_urls"]) == 2
        assert result["image_urls"][0]["original"] == "https://example.com/img1.jpg"
        assert result["image_urls"][0]["thumbnail"] == "https://example.com/thumb1.jpg"
        assert result["image_urls"][0]["sorting_no"] == 1

    def test_image_urls_skips_empty_originals(self):
        ship = self._make_ship(images=[
            {"original": "https://example.com/img.jpg", "thumbnail": "t.jpg"},
            {"original": None, "thumbnail": "orphan.jpg"},
            {"thumbnail": "no-original.jpg"},
        ])
        result = parse_vessel(ship)
        assert len(result["image_urls"]) == 1

    def test_price_with_comma_decimal(self):
        result = parse_vessel(self._make_ship(sales_asking_price="1500000,50"))
        assert result["price"] == 1500000.50

    def test_fallback_to_id_field(self):
        ship = self._make_ship()
        del ship["ship_id"]
        ship["id"] = 9999
        result = parse_vessel(ship)
        assert result["source_id"] == "9999"
