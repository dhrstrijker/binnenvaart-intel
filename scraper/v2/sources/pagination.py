from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def resolve_listing_page_cap(source_key: str, default_cap: int | None = None) -> int | None:
    """Resolve optional listing page cap from env, with source override support.

    Supported env vars:
    - PIPELINE_V3_MAX_LISTING_PAGES
    - PIPELINE_V3_MAX_LISTING_PAGES_<SOURCE_KEY_UPPER>
    """
    candidates = [
        f"PIPELINE_V3_MAX_LISTING_PAGES_{source_key.upper()}",
        "PIPELINE_V3_MAX_LISTING_PAGES",
    ]
    raw_value = None
    for env_key in candidates:
        raw = os.environ.get(env_key)
        if raw is not None and raw.strip():
            raw_value = raw.strip()
            break

    if raw_value is None:
        return default_cap

    try:
        parsed = int(raw_value)
    except ValueError:
        logger.warning("Invalid listing page cap for source %s: %r", source_key, raw_value)
        return default_cap

    if parsed < 1:
        logger.warning("Ignoring non-positive listing page cap for source %s: %d", source_key, parsed)
        return default_cap

    if default_cap is None:
        return parsed
    return min(default_cap, parsed)
