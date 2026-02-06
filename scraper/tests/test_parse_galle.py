from bs4 import BeautifulSoup

from scrape_galle import parse_price, parse_dimensions, extract_image_url, parse_card


class TestParsePrice:
    def test_standard_price(self):
        assert parse_price("€ 5.450.000,-") == 5450000.0

    def test_small_price(self):
        assert parse_price("€ 350.000,-") == 350000.0

    def test_op_aanvraag(self):
        assert parse_price("Prijs op aanvraag") is None

    def test_none(self):
        assert parse_price(None) is None

    def test_empty(self):
        assert parse_price("") is None

    def test_aanvraag_mixed_case(self):
        assert parse_price("Op Aanvraag") is None


class TestParseDimensions:
    def test_standard_format(self):
        length, width = parse_dimensions("110.00 x 11.45 m")
        assert length == 110.0
        assert width == 11.45

    def test_comma_format(self):
        length, width = parse_dimensions("86,00 x 9,50 m")
        assert length == 86.0
        assert width == 9.5

    def test_no_match(self):
        length, width = parse_dimensions("no dimensions here")
        assert length is None
        assert width is None

    def test_empty(self):
        length, width = parse_dimensions("")
        assert length is None
        assert width is None

    def test_tight_spacing(self):
        length, width = parse_dimensions("110.00x11.45m")
        assert length == 110.0
        assert width == 11.45


class TestExtractImageUrl:
    def test_with_background_image(self):
        html = '''
        <div class="cat-product-small">
            <div class="cat-product-small-image">
                <div class="img" style="background-image: url('https://example.com/ship.jpg')"></div>
            </div>
        </div>
        '''
        card = BeautifulSoup(html, "html.parser").select_one(".cat-product-small")
        assert extract_image_url(card) == "https://example.com/ship.jpg"

    def test_no_image_div(self):
        html = '<div class="cat-product-small"></div>'
        card = BeautifulSoup(html, "html.parser").select_one(".cat-product-small")
        assert extract_image_url(card) is None

    def test_no_style(self):
        html = '''
        <div class="cat-product-small">
            <div class="cat-product-small-image">
                <div class="img"></div>
            </div>
        </div>
        '''
        card = BeautifulSoup(html, "html.parser").select_one(".cat-product-small")
        assert extract_image_url(card) is None


class TestParseCard:
    def _make_card_html(self, name="Test Ship", specs="110.00 x 11.45 m", price="€ 1.500.000,-", href="/scheepsaanbod/test-ship"):
        return f'''
        <div class="cat-product-small">
            <a href="{href}">
                <h4>{name}</h4>
                <div class="cat-product-small-specs">{specs}</div>
                <div class="cat-product-small-price">{price}</div>
                <div class="cat-product-small-image">
                    <div class="img" style="background-image: url('https://example.com/ship.jpg')"></div>
                </div>
            </a>
        </div>
        '''

    def test_basic_card(self):
        html = self._make_card_html()
        card = BeautifulSoup(html, "html.parser").select_one(".cat-product-small")
        result = parse_card(card)
        assert result["source"] == "galle"
        assert result["source_id"] == "test-ship"
        assert result["name"] == "Test Ship"
        assert result["length_m"] == 110.0
        assert result["width_m"] == 11.45
        assert result["price"] == 1500000.0
        assert result["url"] == "https://gallemakelaars.nl/scheepsaanbod/test-ship"
        assert result["image_url"] == "https://example.com/ship.jpg"

    def test_price_op_aanvraag(self):
        html = self._make_card_html(price="Prijs op aanvraag")
        card = BeautifulSoup(html, "html.parser").select_one(".cat-product-small")
        result = parse_card(card)
        assert result["price"] is None

    def test_absolute_url(self):
        html = self._make_card_html(href="https://gallemakelaars.nl/scheepsaanbod/absolute")
        card = BeautifulSoup(html, "html.parser").select_one(".cat-product-small")
        result = parse_card(card)
        assert result["url"] == "https://gallemakelaars.nl/scheepsaanbod/absolute"
        assert result["source_id"] == "absolute"
