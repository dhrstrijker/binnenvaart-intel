from scrape_pcshipbrokers import (
    parse_price,
    parse_dimensions,
    parse_tonnage,
    parse_build_year,
    _parse_listing,
)


class TestParsePrice:
    def test_standard_eur(self):
        assert parse_price("EUR 1.795.000,-") == 1795000.0

    def test_euro_symbol(self):
        assert parse_price("€ 1.795.000,-") == 1795000.0

    def test_small_price(self):
        assert parse_price("€ 350.000,-") == 350000.0

    def test_notk(self):
        assert parse_price("N.O.T.K.") is None

    def test_verkocht(self):
        assert parse_price("Verkocht O.V.B.") is None

    def test_none(self):
        assert parse_price(None) is None

    def test_empty(self):
        assert parse_price("") is None


class TestParseDimensions:
    def test_comma_format(self):
        l, w = parse_dimensions("100,00 m x 11,40 m")
        assert l == 100.0
        assert w == 11.4

    def test_dot_format(self):
        l, w = parse_dimensions("100.00 m x 11.40 m")
        assert l == 100.0
        assert w == 11.4

    def test_no_match(self):
        assert parse_dimensions("no dims") == (None, None)

    def test_none(self):
        assert parse_dimensions(None) == (None, None)


class TestParseTonnage:
    def test_standard(self):
        assert parse_tonnage("3.152 ton") == 3152.0

    def test_no_separator(self):
        assert parse_tonnage("500 ton") == 500.0

    def test_none(self):
        assert parse_tonnage(None) is None

    def test_empty(self):
        assert parse_tonnage("") is None


class TestParseBuildYear:
    def test_standard(self):
        assert parse_build_year("Bouwjaar 1973") == 1973

    def test_just_year(self):
        assert parse_build_year("2020") == 2020

    def test_none(self):
        assert parse_build_year(None) is None

    def test_no_year(self):
        assert parse_build_year("no year") is None


class TestParseListing:
    def test_parses_compare_data(self):
        html = """
        <html><body>
        <script>
        compareShipData = {"test-ship": {"slug": "test-ship", "name": "Test Ship", "year": "Bouwjaar 2020", "afmetingen": "100,00 m x 11,40 m", "tonnage": "3.000 ton", "price": "€ 1.500.000,-", "image": "https://cdn.pcshipbrokers.com/img.jpg"}};
        </script>
        <a href="https://pcshipbrokers.com/ships/test-ship">
            <h3>Test Ship</h3>
            Motorvrachtschip
        </a>
        </body></html>
        """
        vessels = _parse_listing(html)
        assert len(vessels) == 1
        v = vessels[0]
        assert v["source"] == "pcshipbrokers"
        assert v["source_id"] == "test-ship"
        assert v["name"] == "Test Ship"
        assert v["type"] == "Motorvrachtschip"
        assert v["length_m"] == 100.0
        assert v["width_m"] == 11.4
        assert v["build_year"] == 2020
        assert v["tonnage"] == 3000.0
        assert v["price"] == 1500000.0

    def test_skips_sold_vessels(self):
        html = """
        <html><body>
        <script>
        compareShipData = {"sold-ship": {"slug": "sold-ship", "name": "Sold Ship", "year": "Bouwjaar 2000", "afmetingen": "80 m x 9 m", "tonnage": "2000 ton", "price": "Verkocht O.V.B.", "image": "img.jpg"}};
        </script>
        </body></html>
        """
        vessels = _parse_listing(html)
        assert len(vessels) == 0

    def test_image_url_unescaped(self):
        html = r"""
        <html><body>
        <script>
        compareShipData = {"img-ship": {"slug": "img-ship", "name": "Image Ship", "year": "", "afmetingen": "", "tonnage": "", "price": "€ 100.000,-", "image": "https:\/\/cdn.pcshipbrokers.com\/media\/12345\/photo.jpg"}};
        </script>
        </body></html>
        """
        vessels = _parse_listing(html)
        assert len(vessels) == 1
        assert vessels[0]["image_url"] == "https://cdn.pcshipbrokers.com/media/12345/photo.jpg"

    def test_image_url_already_clean(self):
        html = """
        <html><body>
        <script>
        compareShipData = {"clean-ship": {"slug": "clean-ship", "name": "Clean Ship", "year": "", "afmetingen": "", "tonnage": "", "price": "€ 100.000,-", "image": "https://cdn.pcshipbrokers.com/media/12345/photo.jpg"}};
        </script>
        </body></html>
        """
        vessels = _parse_listing(html)
        assert len(vessels) == 1
        assert vessels[0]["image_url"] == "https://cdn.pcshipbrokers.com/media/12345/photo.jpg"

    def test_image_url_none_when_empty(self):
        html = """
        <html><body>
        <script>
        compareShipData = {"no-img": {"slug": "no-img", "name": "No Image", "year": "", "afmetingen": "", "tonnage": "", "price": "€ 100.000,-", "image": ""}};
        </script>
        </body></html>
        """
        vessels = _parse_listing(html)
        assert len(vessels) == 1
        assert vessels[0]["image_url"] is None

    def test_image_url_none_when_missing(self):
        html = """
        <html><body>
        <script>
        compareShipData = {"missing-img": {"slug": "missing-img", "name": "Missing Image", "year": "", "afmetingen": "", "tonnage": "", "price": "€ 100.000,-"}};
        </script>
        </body></html>
        """
        vessels = _parse_listing(html)
        assert len(vessels) == 1
        assert vessels[0]["image_url"] is None

    def test_empty_compare_data(self):
        html = "<html><body><p>No data</p></body></html>"
        vessels = _parse_listing(html)
        assert vessels == []
