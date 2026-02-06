"""Smoke tests that hit live broker websites.

These tests verify that each source still serves data in the expected format.
They are SKIPPED in normal CI -- run them explicitly with:

    pytest -m live -v

Or run just one source:

    pytest -m live -k rensendriessen -v
"""

import pytest
import requests
from bs4 import BeautifulSoup

# Minimum expected vessel counts per source (well below actual to avoid flakiness)
# These check the FIRST PAGE only, not the full scrape
MIN_RENSENDRIESSEN = 5   # API returns ~9 per page
MIN_GALLE = 5            # Single page, ~25 vessels
MIN_PCSHIPBROKERS = 20   # Single page, ~152 vessels
MIN_GTSSCHEPEN = 10      # First page shows ~15 cards

live = pytest.mark.live


@live
class TestRensenDriessenLive:
    """Verify RensenDriessen API still returns parseable vessel data."""

    API_URL = "https://api.rensendriessen.com/api/public/ships/brokers/list/filter/"

    def test_api_returns_vessels(self):
        from scrape_rensendriessen import parse_vessel

        resp = requests.post(self.API_URL, json={"page": 1}, timeout=30)
        assert resp.status_code == 200, f"API returned {resp.status_code}"

        data = resp.json()
        ships = data if isinstance(data, list) else data.get("results", data.get("data", []))
        assert len(ships) >= MIN_RENSENDRIESSEN, f"Expected >= {MIN_RENSENDRIESSEN} vessels, got {len(ships)}"

        # Verify first vessel parses without error
        vessel = parse_vessel(ships[0])
        assert vessel["source"] == "rensendriessen"
        assert vessel["name"], "Vessel name is empty"
        assert vessel["source_id"], "Vessel source_id is empty"


@live
class TestGalleLive:
    """Verify Galle Makelaars page still contains parseable vessel cards."""

    URL = "https://gallemakelaars.nl/scheepsaanbod"

    def test_page_returns_vessel_cards(self):
        from scrape_galle import parse_card

        resp = requests.get(self.URL, timeout=30)
        assert resp.status_code == 200, f"Page returned {resp.status_code}"

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select(".cat-product-small")
        assert len(cards) >= MIN_GALLE, f"Expected >= {MIN_GALLE} cards, got {len(cards)}"

        # Verify first card parses without error
        vessel = parse_card(cards[0])
        assert vessel["source"] == "galle"
        assert vessel["name"], "Vessel name is empty"


@live
class TestPCShipbrokersLive:
    """Verify PC Shipbrokers page still contains parseable vessel data."""

    URL = "https://pcshipbrokers.com/scheepsaanbod"

    def test_page_returns_vessels(self):
        from scrape_pcshipbrokers import _parse_listing

        resp = requests.get(self.URL, timeout=30)
        assert resp.status_code == 200, f"Page returned {resp.status_code}"

        vessels = _parse_listing(resp.text)
        assert len(vessels) >= MIN_PCSHIPBROKERS, f"Expected >= {MIN_PCSHIPBROKERS} vessels, got {len(vessels)}"

        # Verify first vessel has required fields
        v = vessels[0]
        assert v["source"] == "pcshipbrokers"
        assert v["name"], "Vessel name is empty"
        assert v["source_id"], "Vessel source_id is empty"


@live
class TestGTSSchepenLive:
    """Verify GTS Schepen page still contains parseable vessel cards."""

    URL = "https://www.gtsschepen.nl/schepen/"

    def test_page_returns_vessel_cards(self):
        from scrape_gtsschepen import parse_card

        resp = requests.get(self.URL, timeout=30)
        assert resp.status_code == 200, f"Page returned {resp.status_code}"

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.select(".grid-item")
        assert len(cards) >= MIN_GTSSCHEPEN, f"Expected >= {MIN_GTSSCHEPEN} cards, got {len(cards)}"

        # Verify first non-sold card parses
        for card in cards:
            vessel = parse_card(card)
            if vessel is not None:
                assert vessel["source"] == "gtsschepen"
                assert vessel["name"], "Vessel name is empty"
                break
        else:
            pytest.fail("All cards were sold or unparseable")
