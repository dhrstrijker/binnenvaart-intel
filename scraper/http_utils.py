"""Shared HTTP helpers for all scrapers."""

import logging
import time

import requests

logger = logging.getLogger(__name__)


def fetch_with_retry(method, url, retries=3, **kwargs):
    """Fetch a URL with exponential-backoff retries on network errors."""
    for attempt in range(1, retries + 1):
        try:
            resp = method(url, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            if attempt == retries:
                raise
            wait = 2 ** (attempt - 1)
            logger.warning("Attempt %d failed: %s. Retrying in %ds...", attempt, e, wait)
            time.sleep(wait)
