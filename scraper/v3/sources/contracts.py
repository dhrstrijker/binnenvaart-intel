"""Validation and helpers for V3 source adapter contracts."""

from __future__ import annotations

from numbers import Number
from typing import TypedDict


class ListingMetricsV3(TypedDict):
    external_requests: int
    selector_fail_count: int
    parse_fail_count: int
    page_coverage_ratio: float


class DetailMetricsV3(TypedDict):
    external_requests: int
    parse_fail_count: int


REQUIRED_LISTING_FIELDS_V3 = {
    "source",
    "source_id",
    "name",
    "type",
    "length_m",
    "width_m",
    "build_year",
    "tonnage",
    "price",
    "url",
    "image_url",
}

TRUE_VALUES = {True, 1, "1", "true", "yes", "y", "sold", "verkocht"}
FALSE_VALUES = {False, 0, "0", "false", "no", "n", "active", "available", "te koop"}


def new_listing_metrics_v3() -> ListingMetricsV3:
    return {
        "external_requests": 0,
        "selector_fail_count": 0,
        "parse_fail_count": 0,
        "page_coverage_ratio": 1.0,
    }


def new_detail_metrics_v3() -> DetailMetricsV3:
    return {
        "external_requests": 0,
        "parse_fail_count": 0,
    }


def normalize_sold_flag(value, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in TRUE_VALUES:
            return True
        if lowered in FALSE_VALUES:
            return False
        return default
    if value in TRUE_VALUES:
        return True
    if value in FALSE_VALUES:
        return False
    return bool(value)


def validate_listing_rows_v3(source: str, rows: list[dict]) -> list[dict]:
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"{source} listing row[{idx}] must be dict")
        missing = REQUIRED_LISTING_FIELDS_V3.difference(row.keys())
        if missing:
            missing_str = ", ".join(sorted(missing))
            raise ValueError(f"{source} listing row[{idx}] missing required fields: {missing_str}")
        if row.get("source") != source:
            raise ValueError(f"{source} listing row[{idx}] has mismatched source value: {row.get('source')}")
        row["source_id"] = str(row["source_id"])
        row["is_sold"] = normalize_sold_flag(row.get("is_sold"), default=False)
    return rows


def validate_listing_metrics_v3(source: str, metrics: dict) -> ListingMetricsV3:
    required = {"external_requests", "selector_fail_count", "parse_fail_count", "page_coverage_ratio"}
    missing = required.difference(metrics.keys())
    if missing:
        missing_str = ", ".join(sorted(missing))
        raise ValueError(f"{source} listing metrics missing keys: {missing_str}")

    ext = _as_non_negative_int(metrics["external_requests"], source, "external_requests")
    selector = _as_non_negative_int(metrics["selector_fail_count"], source, "selector_fail_count")
    parse = _as_non_negative_int(metrics["parse_fail_count"], source, "parse_fail_count")
    coverage = _as_ratio(metrics["page_coverage_ratio"], source, "page_coverage_ratio")
    return {
        "external_requests": ext,
        "selector_fail_count": selector,
        "parse_fail_count": parse,
        "page_coverage_ratio": coverage,
    }


def validate_detail_metrics_v3(source: str, metrics: dict) -> DetailMetricsV3:
    required = {"external_requests", "parse_fail_count"}
    missing = required.difference(metrics.keys())
    if missing:
        missing_str = ", ".join(sorted(missing))
        raise ValueError(f"{source} detail metrics missing keys: {missing_str}")

    return {
        "external_requests": _as_non_negative_int(metrics["external_requests"], source, "external_requests"),
        "parse_fail_count": _as_non_negative_int(metrics["parse_fail_count"], source, "parse_fail_count"),
    }


def validate_detail_row_v3(source: str, row: dict) -> dict:
    if not isinstance(row, dict):
        raise ValueError(f"{source} detail payload must be dict")
    if not row.get("source_id"):
        raise ValueError(f"{source} detail payload missing source_id")
    if row.get("source") != source:
        raise ValueError(f"{source} detail payload has mismatched source value: {row.get('source')}")
    row["source_id"] = str(row["source_id"])
    row["is_sold"] = normalize_sold_flag(row.get("is_sold"), default=False)
    return row


def _as_non_negative_int(value, source: str, key: str) -> int:
    if isinstance(value, bool) or not isinstance(value, Number):
        raise ValueError(f"{source} metric {key} must be numeric, got {type(value).__name__}")
    int_value = int(value)
    if int_value < 0:
        raise ValueError(f"{source} metric {key} must be >= 0")
    return int_value


def _as_ratio(value, source: str, key: str) -> float:
    if isinstance(value, bool) or not isinstance(value, Number):
        raise ValueError(f"{source} metric {key} must be numeric, got {type(value).__name__}")
    ratio = float(value)
    if ratio < 0 or ratio > 1:
        raise ValueError(f"{source} metric {key} must be between 0 and 1")
    return ratio
