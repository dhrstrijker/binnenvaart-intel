from bs4 import BeautifulSoup

from scrape_gtsschepen import (
    parse_price,
    parse_dimensions,
    parse_tonnage,
    parse_build_year,
    parse_card,
)


class TestParsePrice:
    def test_standard(self):
        assert parse_price("€ 395.000,-") == 395000.0

    def test_large(self):
        assert parse_price("€ 5.450.000,-") == 5450000.0

    def test_notk(self):
        assert parse_price("notk") is None

    def test_none(self):
        assert parse_price(None) is None

    def test_empty(self):
        assert parse_price("") is None


class TestParseDimensions:
    def test_dot_format(self):
        l, w = parse_dimensions("80.14m x 8.21m")
        assert l == 80.14
        assert w == 8.21

    def test_comma_format(self):
        l, w = parse_dimensions("80,14 m x 8,21 m")
        assert l == 80.14
        assert w == 8.21

    def test_no_match(self):
        assert parse_dimensions("no dims") == (None, None)


class TestParseTonnage:
    def test_with_ton(self):
        assert parse_tonnage("1128 ton") == 1128.0

    def test_with_t(self):
        assert parse_tonnage("1.128 t") == 1128.0

    def test_none(self):
        assert parse_tonnage(None) is None


class TestParseBuildYear:
    def test_with_prefix(self):
        assert parse_build_year("Bouwjr 1960") == 1960

    def test_with_pipe(self):
        assert parse_build_year("| Bouwjr 1960") == 1960

    def test_none(self):
        assert parse_build_year(None) is None


class TestParseCard:
    def _make_card_html(
        self,
        name="Test Ship",
        price="€ 395.000,-",
        specs_lines=None,
        href="/schepen/test-ship/",
        label=None,
        image_url="https://www.gtsschepen.nl/wp-content/uploads/2026/01/ship.jpg",
    ):
        if specs_lines is None:
            specs_lines = ["Motorvrachtschip", "1128 ton", "80.14m x 8.21m"]
        specs_html = "<br>".join(specs_lines)
        label_html = f'<div class="item-label">{label}</div>' if label else ""
        return f"""
        <div class="grid-item">
            <div class="item-image" style="background-image: url('{image_url}')">
                {label_html}
            </div>
            <div class="item-content text-center">
                <h3><a href="{href}">{name}</a></h3>
                <p><strong>{price}</strong></p>
                <p>{specs_html}</p>
            </div>
        </div>
        """

    def test_basic_card(self):
        html = self._make_card_html()
        card = BeautifulSoup(html, "html.parser").select_one(".grid-item")
        result = parse_card(card)
        assert result["source"] == "gtsschepen"
        assert result["source_id"] == "test-ship"
        assert result["name"] == "Test Ship"
        assert result["type"] == "Motorvrachtschip"
        assert result["tonnage"] == 1128.0
        assert result["length_m"] == 80.14
        assert result["width_m"] == 8.21
        assert result["price"] == 395000.0

    def test_sold_vessel_returns_none(self):
        html = self._make_card_html(label="Verkocht")
        card = BeautifulSoup(html, "html.parser").select_one(".grid-item")
        assert parse_card(card) is None

    def test_nieuw_label_still_parsed(self):
        html = self._make_card_html(label="Nieuw")
        card = BeautifulSoup(html, "html.parser").select_one(".grid-item")
        result = parse_card(card)
        assert result is not None
        assert result["name"] == "Test Ship"

    def test_with_build_year(self):
        html = self._make_card_html(specs_lines=["Motorvrachtschip", "1128 ton", "80.14m x 8.21m", "| Bouwjr 1960"])
        card = BeautifulSoup(html, "html.parser").select_one(".grid-item")
        result = parse_card(card)
        assert result["build_year"] == 1960

    def test_no_price(self):
        html = self._make_card_html(price="")
        card = BeautifulSoup(html, "html.parser").select_one(".grid-item")
        result = parse_card(card)
        assert result["price"] is None

    def test_image_url(self):
        html = self._make_card_html()
        card = BeautifulSoup(html, "html.parser").select_one(".grid-item")
        result = parse_card(card)
        assert result["image_url"] == "https://www.gtsschepen.nl/wp-content/uploads/2026/01/ship.jpg"

    def test_image_url_strips_whitespace(self):
        html = self._make_card_html(image_url="https://www.gtsschepen.nl/wp-content/uploads/2026/01/ship.jpg   ")
        card = BeautifulSoup(html, "html.parser").select_one(".grid-item")
        result = parse_card(card)
        assert result["image_url"] == "https://www.gtsschepen.nl/wp-content/uploads/2026/01/ship.jpg"
