"""Shared HTTP helpers for all scrapers."""

import logging
import time

import requests

logger = logging.getLogger(__name__)

NON_RETRYABLE_STATUS_CODES = {401, 404, 410}


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
            # Longer backoff for 429 rate-limit responses
            if resp_obj is not None and resp_obj.status_code == 429:
                retry_after = resp_obj.headers.get("Retry-After")
                wait = int(retry_after) if retry_after and retry_after.isdigit() else 5 * attempt
            else:
                wait = 2 ** (attempt - 1)
            logger.warning("Attempt %d failed: %s. Retrying in %ds...", attempt, e, wait)
            time.sleep(wait)
