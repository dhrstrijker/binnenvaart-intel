from bs4 import BeautifulSoup

from scrape_galle import (
    parse_price, parse_dimensions, extract_image_url, parse_card,
    _parse_detail_specs, _parse_detail_images, _parse_tonnage,
    _parse_dutch_number, _fetch_detail,
)


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


DETAIL_HTML = '''
<html><body>
<div class="product-specs">
  <h7>Algemeen</h7>
  <div class="spec-row">
    <label class="spec-label">naam</label>
    <label class="spec-value">Isella</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">type schip</label>
    <label class="spec-value">Motorvrachtschip</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">bouwjaar</label>
    <label class="spec-value">1970</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">scheepswerf</label>
    <label class="spec-value">De Schroef te Sluiskil</label>
  </div>
  <h7>Tonnenmaat</h7>
  <div class="spec-row">
    <label class="spec-label">maximum diepgang (t)</label>
    <label class="spec-value">1.815,000</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">op 2m00 (t)</label>
    <label class="spec-value">932,000</label>
  </div>
  <h7>Afmetingen</h7>
  <div class="spec-row">
    <label class="spec-label">lengte (m)</label>
    <label class="spec-value">85,00</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">breedte (m)</label>
    <label class="spec-value">9,50</label>
  </div>
  <h7>Ruimen</h7>
  <div class="spec-row">
    <label class="spec-label">containers (TEU)</label>
    <label class="spec-value">54</label>
  </div>
  <h7>Buikdenning
    Staal 12mm
  </h7>
  <h7>Kopschroef
    fabr. De Groot/Van Ballegooy, Scania 450 pk bj. 1999
  </h7>
  <h7>Luiken</h7>
  <div class="spec-row">
    <label class="spec-label">type</label>
    <label class="spec-value">friese kap aluminium luiken</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">bouwjaar</label>
    <label class="spec-value">2006</label>
  </div>
  <h7>Hoofdmotor(en)</h7>
  <div class="spec-row">
    <label class="spec-label">fabr. merk</label>
    <label class="spec-value">Scania</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">pk</label>
    <label class="spec-value">550</label>
  </div>
  <div class="spec-row">
    <label class="spec-label">kw</label>
    <label class="spec-value">404</label>
  </div>
</div>
<img src="/uploads/ships/photo1.jpg">
<img src="/uploads/ships/photo2.jpg">
<div style="background-image: url('/uploads/ships/photo3.jpg')"></div>
<img src="/static/logo.png">
</body></html>
'''


class TestParseDetailSpecs:
    def _soup(self, html=DETAIL_HTML):
        return BeautifulSoup(html, "html.parser")

    def test_algemeen_fields(self):
        specs = _parse_detail_specs(self._soup())
        assert specs["naam"] == "Isella"
        assert specs["type schip"] == "Motorvrachtschip"
        assert specs["bouwjaar"] == "1970"
        assert specs["scheepswerf"] == "De Schroef te Sluiskil"

    def test_tonnenmaat_prefixed(self):
        specs = _parse_detail_specs(self._soup())
        assert specs["tonnenmaat > maximum diepgang (t)"] == "1.815,000"
        assert specs["tonnenmaat > op 2m00 (t)"] == "932,000"

    def test_afmetingen_prefixed(self):
        specs = _parse_detail_specs(self._soup())
        assert specs["afmetingen > lengte (m)"] == "85,00"
        assert specs["afmetingen > breedte (m)"] == "9,50"

    def test_text_only_sections(self):
        specs = _parse_detail_specs(self._soup())
        assert specs["buikdenning"] == "Staal 12mm"
        assert "De Groot/Van Ballegooy" in specs["kopschroef"]

    def test_luiken_prefixed(self):
        specs = _parse_detail_specs(self._soup())
        assert specs["luiken > type"] == "friese kap aluminium luiken"
        assert specs["luiken > bouwjaar"] == "2006"

    def test_motor_prefixed(self):
        specs = _parse_detail_specs(self._soup())
        assert specs["hoofdmotor(en) > fabr. merk"] == "Scania"
        assert specs["hoofdmotor(en) > pk"] == "550"
        assert specs["hoofdmotor(en) > kw"] == "404"

    def test_no_collision_bouwjaar(self):
        """bouwjaar appears in Algemeen and Luiken — they should not collide."""
        specs = _parse_detail_specs(self._soup())
        assert specs["bouwjaar"] == "1970"
        assert specs["luiken > bouwjaar"] == "2006"

    def test_empty_page(self):
        soup = BeautifulSoup("<html><body></body></html>", "html.parser")
        assert _parse_detail_specs(soup) == {}

    def test_no_spec_rows(self):
        soup = BeautifulSoup('<div class="product-specs"><h7>Algemeen</h7></div>', "html.parser")
        specs = _parse_detail_specs(soup)
        assert specs == {}

    def test_multiple_product_specs_containers(self):
        html = """
        <div class="product-specs">
          <h7>Algemeen</h7>
          <div class="spec-row">
            <label class="spec-label">naam</label>
            <label class="spec-value">Liverpool</label>
          </div>
        </div>
        <div class="product-specs">
          <h7>Hoofdmotor(en)</h7>
          <div class="spec-row">
            <label class="spec-label">fabr. merk</label>
            <label class="spec-value">Mitsubishi</label>
          </div>
          <div class="spec-row">
            <label class="spec-label">type</label>
            <label class="spec-value">S12R STAGE 5</label>
          </div>
        </div>
        """
        specs = _parse_detail_specs(BeautifulSoup(html, "html.parser"))
        assert specs["naam"] == "Liverpool"
        assert specs["hoofdmotor(en) > fabr. merk"] == "Mitsubishi"
        assert specs["hoofdmotor(en) > type"] == "S12R STAGE 5"

    def test_nested_spec_rows_inside_wrapper(self):
        html = """
        <div class="product-specs">
          <h7>Hoofdmotor(en)</h7>
          <div class="spec-group">
            <div class="spec-row">
              <label class="spec-label">pk</label>
              <label class="spec-value">1.278</label>
            </div>
            <div class="spec-row">
              <label class="spec-label">kw</label>
              <label class="spec-value">940</label>
            </div>
          </div>
        </div>
        """
        specs = _parse_detail_specs(BeautifulSoup(html, "html.parser"))
        assert specs["hoofdmotor(en) > pk"] == "1.278"
        assert specs["hoofdmotor(en) > kw"] == "940"

    def test_rows_without_spec_label_classes(self):
        html = """
        <div class="product-specs">
          <h7>Hoofdmotor(en)</h7>
          <div class="spec-row">
            <label>Keerkoppeling</label>
            <label>ZF, BW 461, rev. 2024.</label>
          </div>
          <div class="spec-row">
            <label>Reductie</label>
            <label>4,294:1</label>
          </div>
        </div>
        """
        specs = _parse_detail_specs(BeautifulSoup(html, "html.parser"))
        assert specs["hoofdmotor(en) > keerkoppeling"] == "ZF, BW 461, rev. 2024."
        assert specs["hoofdmotor(en) > reductie"] == "4,294:1"

    def test_rows_with_spec_value_1_and_2_classes(self):
        html = """
        <div class="product-specs">
          <h7>Hoofdmotor(en)</h7>
          <div class="spec-row">
            <label class="spec-label mobile_fix">&nbsp;</label>
            <label class="spec-value-1">fabr. merk</label>
            <label class="spec-value-2">Mitsubishi</label>
          </div>
          <div class="spec-row">
            <label class="spec-label mobile_fix">&nbsp;</label>
            <label class="spec-value-1">keerkoppeling</label>
            <label class="spec-value-2">ZF, BW 461, rev. 2024.</label>
          </div>
        </div>
        """
        specs = _parse_detail_specs(BeautifulSoup(html, "html.parser"))
        assert specs["hoofdmotor(en) > fabr. merk"] == "Mitsubishi"
        assert specs["hoofdmotor(en) > keerkoppeling"] == "ZF, BW 461, rev. 2024."


class TestParseDetailImages:
    def _soup(self, html=DETAIL_HTML):
        return BeautifulSoup(html, "html.parser")

    def test_extracts_upload_images(self):
        images = _parse_detail_images(self._soup())
        assert "https://gallemakelaars.nl/uploads/ships/photo1.jpg" in images
        assert "https://gallemakelaars.nl/uploads/ships/photo2.jpg" in images

    def test_extracts_background_images(self):
        images = _parse_detail_images(self._soup())
        assert "https://gallemakelaars.nl/uploads/ships/photo3.jpg" in images

    def test_skips_non_upload_images(self):
        images = _parse_detail_images(self._soup())
        assert not any("logo.png" in url for url in images)

    def test_no_duplicates(self):
        images = _parse_detail_images(self._soup())
        assert len(images) == len(set(images))

    def test_empty_page(self):
        soup = BeautifulSoup("<html><body></body></html>", "html.parser")
        assert _parse_detail_images(soup) == []


class TestParseDutchNumber:
    def test_dot_and_comma(self):
        """Standard Dutch: '1.815,000' → 1815.0"""
        assert _parse_dutch_number("1.815,000") == 1815.0

    def test_dot_and_comma_with_fraction(self):
        """'3.921,758' → 3921.758"""
        assert _parse_dutch_number("3.921,758") == 3921.758

    def test_comma_thousands(self):
        """'4,284' → 4284 (comma as thousands separator, non-zero digits)"""
        assert _parse_dutch_number("4,284") == 4284.0

    def test_comma_decimal_zeros(self):
        """'932,000' → 932.0 (trailing zeros = decimal)"""
        assert _parse_dutch_number("932,000") == 932.0

    def test_plain_number(self):
        assert _parse_dutch_number("2826") == 2826.0

    def test_dot_only(self):
        """'2.826' → 2826 (dot as thousands separator)"""
        assert _parse_dutch_number("2.826") == 2826.0

    def test_with_ton_suffix(self):
        assert _parse_dutch_number("2.826 ton") == 2826.0

    def test_comma_short_decimal(self):
        """'4,28' → 4.28 (less than 3 digits after comma = decimal)"""
        assert _parse_dutch_number("4,28") == 4.28

    def test_empty(self):
        assert _parse_dutch_number("") is None

    def test_invalid(self):
        assert _parse_dutch_number("n/a") is None


class TestParseTonnage:
    def test_standard_dutch(self):
        specs = {"tonnenmaat > maximum diepgang (t)": "1.815,000"}
        assert _parse_tonnage(specs) == 1815.0

    def test_plain_number(self):
        specs = {"tonnenmaat > maximum diepgang (t)": "2826"}
        assert _parse_tonnage(specs) == 2826.0

    def test_with_ton_suffix(self):
        specs = {"maximaal laadvermogen": "2.826 ton"}
        assert _parse_tonnage(specs) == 2826.0

    def test_direct_key(self):
        specs = {"maximum diepgang (t)": "900,000"}
        assert _parse_tonnage(specs) == 900.0

    def test_comma_thousands(self):
        """'4,284' should parse as 4284 tonnes, not 4.284"""
        specs = {"tonnenmaat > maximum diepgang (t)": "4,284"}
        assert _parse_tonnage(specs) == 4284.0

    def test_missing(self):
        assert _parse_tonnage({}) is None

    def test_invalid_value(self):
        specs = {"tonnenmaat > maximum diepgang (t)": "n/a"}
        assert _parse_tonnage(specs) is None


def test_fetch_detail_prefers_richer_url_variant(monkeypatch):
    sparse_html = """
    <html><body>
      <div class="product-specs">
        <h7>Algemeen</h7>
        <div class="spec-row"><label class="spec-label">naam</label><label class="spec-value">Liverpool</label></div>
      </div>
    </body></html>
    """
    rich_html = """
    <html><body>
      <div class="product-specs">
        <h7>Algemeen</h7>
        <div class="spec-row"><label class="spec-label">naam</label><label class="spec-value">Liverpool</label></div>
      </div>
      <div class="product-specs">
        <h7>Hoofdmotor(en)</h7>
        <div class="spec-row"><label class="spec-label">fabr. merk</label><label class="spec-value">Mitsubishi</label></div>
        <div class="spec-row"><label class="spec-label">type</label><label class="spec-value">S12R STAGE 5</label></div>
      </div>
    </body></html>
    """

    calls = []

    class _Resp:
        def __init__(self, text: str):
            self.text = text

    def _fake_fetch(_method, url, **_kwargs):
        calls.append(url)
        if "/scheepsaanbod/" in url:
            return _Resp(rich_html)
        return _Resp(sparse_html)

    monkeypatch.setattr("scrape_galle._fetch_with_retry", _fake_fetch)

    result = _fetch_detail("http://gallemakelaars.nl/liverpool")
    assert result["raw_details"]["hoofdmotor(en) > fabr. merk"] == "Mitsubishi"
    assert result["raw_details"]["hoofdmotor(en) > type"] == "S12R STAGE 5"
    assert any("/scheepsaanbod/liverpool" in u for u in calls)
