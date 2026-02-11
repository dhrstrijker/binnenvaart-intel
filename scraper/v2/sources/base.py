from typing import Protocol


class SourceAdapter(Protocol):
    source_key: str

    def scrape_listing(self) -> tuple[list[dict], dict]:
        """Return listing rows and adapter metrics."""

    def enrich_detail(self, listing_row: dict) -> tuple[dict, dict]:
        """Return normalized vessel payload and adapter metrics."""
