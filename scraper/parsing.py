"""Shared text-parsing helpers used by HTML-based scrapers.

Each function accepts a raw string (or None) and returns a parsed value.
Sanity checks on the parsed values live in db._sanitize_vessel, not here.
"""

import re

SKIP_PHRASES = (
    "aanvraag", "verkocht", "n.o.t.k", "notk", "in overleg",
    "to be agreed", "price on request",
)


def parse_price(text: str | None) -> float | None:
    """Parse price like '€ 1.795.000,-' or 'EUR 1.795.000,-' to float."""
    if not text:
        return None
    text = text.strip()
    if any(phrase in text.lower() for phrase in SKIP_PHRASES):
        return None
    cleaned = (
        text.replace("€", "").replace("EUR", "").replace(" ", "")
        .replace(".", "").replace(",-", "").strip()
    )
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_dimensions(text: str | None) -> tuple[float | None, float | None]:
    """Parse dimensions like '100,00 m x 11,40 m' to (length, width)."""
    if not text:
        return None, None
    match = re.search(r"([\d.,]+)\s*m?\s*x\s*([\d.,]+)", text)
    if not match:
        return None, None
    try:
        length = float(match.group(1).replace(",", "."))
        width = float(match.group(2).replace(",", "."))
        return length, width
    except ValueError:
        return None, None


def parse_build_year(text: str | None) -> int | None:
    """Parse build year from text like 'Bouwjaar 1973' to int."""
    if not text:
        return None
    match = re.search(r"(\d{4})", text)
    return int(match.group(1)) if match else None


def parse_tonnage(text: str | None) -> float | None:
    """Parse tonnage like '3.152 ton' or '1.128 t' to float."""
    if not text:
        return None
    cleaned = text.lower().replace("ton", "").replace("t", "").replace(".", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_dimension_value(value) -> float | None:
    """Parse a single dimension like '110,00m' or 110.0 to float."""
    if value is None:
        return None
    s = str(value).strip().lower().replace("m", "").replace(",", ".").strip()
    if not s:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_bool(value) -> bool:
    """Parse explicit boolean-like values from source payloads."""
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "ja"}:
            return True
        if normalized in {"false", "0", "no", "n", "nee", ""}:
            return False
    return False
