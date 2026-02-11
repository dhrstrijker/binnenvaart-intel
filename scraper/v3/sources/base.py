from typing import Protocol

from v3.sources.contracts import DetailMetricsV3, ListingMetricsV3


class SourceAdapterV3(Protocol):
    source_key: str

    def scrape_listing(self) -> tuple[list[dict], ListingMetricsV3]:
        """Return normalized listing rows and adapter metrics."""

    def enrich_detail(self, listing_row: dict) -> tuple[dict, DetailMetricsV3]:
        """Return normalized detailed vessel payload and adapter metrics."""
