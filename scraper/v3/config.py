from dataclasses import dataclass
from typing import Literal


RetryPolicy = Literal["default", "strict_non_retryable"]
DetailFetchPolicy = Literal["always", "new_or_changed"]


@dataclass(frozen=True)
class SourceConfigV3:
    source_key: str
    listing_page_size: int
    retry_policy: RetryPolicy
    detail_fetch_policy: DetailFetchPolicy
    max_consecutive_misses_for_removed: int
    health_thresholds: dict[str, float]
    detail_worker_batch_size: int


DEFAULT_SOURCE_CONFIGS_V3: dict[str, SourceConfigV3] = {
    "galle": SourceConfigV3(
        source_key="galle",
        listing_page_size=25,
        retry_policy="strict_non_retryable",
        detail_fetch_policy="new_or_changed",
        max_consecutive_misses_for_removed=2,
        health_thresholds={
            "max_parse_fail_ratio": 0.10,
            "max_selector_fail_count": 3,
            "min_page_coverage_ratio": 0.65,
        },
        detail_worker_batch_size=20,
    ),
    "rensendriessen": SourceConfigV3(
        source_key="rensendriessen",
        listing_page_size=10,
        retry_policy="strict_non_retryable",
        detail_fetch_policy="new_or_changed",
        max_consecutive_misses_for_removed=2,
        health_thresholds={
            "max_parse_fail_ratio": 0.10,
            "max_selector_fail_count": 3,
            "min_page_coverage_ratio": 0.65,
        },
        detail_worker_batch_size=20,
    ),
    "pcshipbrokers": SourceConfigV3(
        source_key="pcshipbrokers",
        listing_page_size=200,
        retry_policy="strict_non_retryable",
        detail_fetch_policy="new_or_changed",
        max_consecutive_misses_for_removed=2,
        health_thresholds={
            "max_parse_fail_ratio": 0.10,
            "max_selector_fail_count": 3,
            "min_page_coverage_ratio": 0.65,
        },
        detail_worker_batch_size=30,
    ),
    "gtsschepen": SourceConfigV3(
        source_key="gtsschepen",
        listing_page_size=15,
        retry_policy="strict_non_retryable",
        detail_fetch_policy="new_or_changed",
        max_consecutive_misses_for_removed=2,
        health_thresholds={
            "max_parse_fail_ratio": 0.10,
            "max_selector_fail_count": 3,
            "min_page_coverage_ratio": 0.65,
        },
        detail_worker_batch_size=20,
    ),
    "gsk": SourceConfigV3(
        source_key="gsk",
        listing_page_size=50,
        retry_policy="strict_non_retryable",
        detail_fetch_policy="new_or_changed",
        max_consecutive_misses_for_removed=2,
        health_thresholds={
            "max_parse_fail_ratio": 0.10,
            "max_selector_fail_count": 3,
            "min_page_coverage_ratio": 0.65,
        },
        detail_worker_batch_size=15,
    ),
}

SOURCE_ADAPTER_OWNERS_V3: dict[str, str] = {
    "galle": "scraper-pipeline",
    "rensendriessen": "scraper-pipeline",
    "pcshipbrokers": "scraper-pipeline",
    "gtsschepen": "scraper-pipeline",
    "gsk": "scraper-pipeline",
}
