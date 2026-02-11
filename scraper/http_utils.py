from __future__ import annotations

"""Shared HTTP helpers for all scrapers."""

import logging
import os
import random
import threading
import time
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests

logger = logging.getLogger(__name__)

NON_RETRYABLE_STATUS_CODES = {401, 404, 410}
_BACKOFF_PRIORITY_STATUS_CODES = {429, 503}

_REQUEST_LOCK = threading.Lock()
_LAST_SCHEDULED_AT_BY_HOST: dict[str, float] = {}
_ROBOTS_LOCK = threading.Lock()
_ROBOTS_CRAWL_DELAY_CACHE: dict[str, tuple[float, float | None]] = {}


def _read_float_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw.strip())
    except ValueError:
        logger.warning("Invalid float value for %s=%r; using default=%s", name, raw, default)
        return default
    return value


def _read_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        logger.warning("Invalid integer value for %s=%r; using default=%s", name, raw, default)
        return default
    return value


def _is_truthy_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_host_delay_overrides() -> dict[str, float]:
    raw = os.environ.get("SCRAPER_HTTP_MIN_INTERVAL_BY_HOST", "").strip()
    if not raw:
        return {}

    overrides: dict[str, float] = {}
    for token in raw.split(","):
        chunk = token.strip()
        if not chunk or "=" not in chunk:
            continue
        host_raw, delay_raw = chunk.split("=", 1)
        host = host_raw.strip().lower()
        if not host:
            continue
        try:
            delay = float(delay_raw.strip())
        except ValueError:
            logger.warning("Invalid host delay override %r", chunk)
            continue
        overrides[host] = max(0.0, delay)
    return overrides


def _resolve_min_interval_seconds(host: str) -> float:
    default_delay = max(0.0, _read_float_env("SCRAPER_HTTP_MIN_INTERVAL_SECONDS", 0.0))
    if not host:
        return default_delay
    overrides = _parse_host_delay_overrides()
    return overrides.get(host.lower(), default_delay)


def _resolve_crawl_delay_seconds(scheme: str, host: str) -> float:
    if not host or not _is_truthy_env("SCRAPER_HTTP_RESPECT_ROBOTS", default=False):
        return 0.0

    cache_seconds = max(60, _read_int_env("SCRAPER_HTTP_ROBOTS_CACHE_SECONDS", 21600))
    cache_key = f"{scheme}://{host}"
    now_epoch = time.time()

    with _ROBOTS_LOCK:
        cached = _ROBOTS_CRAWL_DELAY_CACHE.get(cache_key)
        if cached and now_epoch - cached[0] <= cache_seconds:
            return max(0.0, float(cached[1] or 0.0))

    robots_url = f"{scheme}://{host}/robots.txt"
    user_agent = os.environ.get("SCRAPER_HTTP_ROBOTS_USER_AGENT", "*").strip() or "*"
    crawl_delay_seconds = 0.0
    try:
        response = requests.get(robots_url, timeout=10)
        if response.status_code < 400 and response.text:
            parser = RobotFileParser()
            parser.parse(response.text.splitlines())
            delay_value = parser.crawl_delay(user_agent)
            if delay_value is None and user_agent != "*":
                delay_value = parser.crawl_delay("*")
            if delay_value is not None:
                crawl_delay_seconds = max(0.0, float(delay_value))
    except requests.RequestException:
        crawl_delay_seconds = 0.0

    with _ROBOTS_LOCK:
        _ROBOTS_CRAWL_DELAY_CACHE[cache_key] = (now_epoch, crawl_delay_seconds)

    return crawl_delay_seconds


def _sleep_for_politeness(url: str) -> None:
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    if not host:
        return

    scheme = parsed.scheme or "https"
    min_interval = _resolve_min_interval_seconds(host)
    crawl_delay = _resolve_crawl_delay_seconds(scheme, host)
    effective_interval = max(min_interval, crawl_delay)
    if effective_interval <= 0:
        return

    jitter_ratio = max(0.0, _read_float_env("SCRAPER_HTTP_JITTER_RATIO", 0.0))
    jitter_cap = max(0.0, _read_float_env("SCRAPER_HTTP_JITTER_MAX_SECONDS", 0.0))
    jitter_budget = min(jitter_cap, effective_interval * jitter_ratio) if jitter_ratio > 0 else 0.0
    jitter = random.uniform(0.0, jitter_budget) if jitter_budget > 0 else 0.0
    spacing = effective_interval + jitter

    with _REQUEST_LOCK:
        now = time.monotonic()
        scheduled_at = _LAST_SCHEDULED_AT_BY_HOST.get(host, now)
        wait_for = max(0.0, scheduled_at - now)
        _LAST_SCHEDULED_AT_BY_HOST[host] = max(now, scheduled_at) + spacing

    if wait_for > 0:
        time.sleep(wait_for)


def get_http_status(exc: Exception) -> int | None:
    """Extract HTTP status code from requests exceptions when available."""
    resp_obj = getattr(exc, "response", None)
    return resp_obj.status_code if resp_obj is not None else None


def is_non_retryable_http_error(exc: Exception) -> bool:
    """Return True if the exception maps to a non-retryable HTTP status."""
    status_code = get_http_status(exc)
    return status_code in NON_RETRYABLE_STATUS_CODES


def fetch_with_retry(method, url, retries=3, **kwargs):
    """Fetch a URL with exponential-backoff retries on network errors.

    Uses longer backoff for 429 (rate-limit) responses, respecting
    the Retry-After header when present.
    """
    for attempt in range(1, retries + 1):
        try:
            _sleep_for_politeness(url)
            resp = method(url, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            resp_obj = getattr(e, "response", None)
            status_code = get_http_status(e)
            if is_non_retryable_http_error(e):
                logger.warning("Non-retryable HTTP %s for %s; failing fast.", status_code, url)
                raise
            if attempt == retries:
                raise
            if resp_obj is not None and resp_obj.status_code in _BACKOFF_PRIORITY_STATUS_CODES:
                retry_after = resp_obj.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    wait = int(retry_after)
                elif resp_obj.status_code == 429:
                    wait = 5 * attempt
                else:
                    wait = 7 * attempt
            else:
                wait = 2 ** (attempt - 1)
            logger.warning("Attempt %d failed: %s. Retrying in %ds...", attempt, e, wait)
            time.sleep(wait)
