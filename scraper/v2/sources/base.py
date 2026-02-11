from typing import Protocol

from v2.sources.contracts import DetailMetrics, ListingMetrics


class SourceAdapter(Protocol):
    source_key: str

    def scrape_listing(self) -> tuple[list[dict], ListingMetrics]:
        """Return listing rows and adapter metrics."""

    def enrich_detail(self, listing_row: dict) -> tuple[dict, DetailMetrics]:
        """Return normalized vessel payload and adapter metrics."""
