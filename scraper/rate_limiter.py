"""Token-aware rate limiter for Anthropic API calls.

Provides proactive throttling based on output tokens per minute to avoid
429 rate limit errors. The Tier 1 limit for Haiku 4.5 is 10K output
tokens/minute — this limiter keeps usage under a configurable budget
(default 9K, leaving 10% safety margin).
"""

import logging
import threading
import time

logger = logging.getLogger(__name__)

# Retryable HTTP status codes from Anthropic
_RETRYABLE_STATUS_CODES = {429, 529}


class TokenRateLimiter:
    """Sliding-window rate limiter tracking output tokens per minute."""

    def __init__(self, tokens_per_minute: int = 9000):
        self._budget = tokens_per_minute
        self._window: list[tuple[float, int]] = []  # (timestamp, token_count)
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        """Remove entries older than 60 seconds."""
        cutoff = now - 60.0
        self._window = [(t, n) for t, n in self._window if t > cutoff]

    def _current_usage(self, now: float) -> int:
        """Sum of tokens in the current 60-second window."""
        self._prune(now)
        return sum(n for _, n in self._window)

    def wait_if_needed(self, estimated_tokens: int) -> None:
        """Block until there is room in the budget for estimated_tokens."""
        while True:
            with self._lock:
                now = time.monotonic()
                usage = self._current_usage(now)
                if usage + estimated_tokens <= self._budget:
                    # Reserve the estimated tokens now (will be corrected by record())
                    self._window.append((now, estimated_tokens))
                    return
                # Calculate how long until enough tokens expire
                needed = usage + estimated_tokens - self._budget
                accumulated = 0
                sleep_until = now
                for ts, count in self._window:
                    accumulated += count
                    if accumulated >= needed:
                        sleep_until = ts + 60.0
                        break
                wait_time = max(0.1, sleep_until - now)

            logger.info(
                "Rate limiter: %d/%d tokens used, waiting %.1fs before next call",
                usage, self._budget, wait_time,
            )
            time.sleep(wait_time)

    def record(self, output_tokens: int, estimated_tokens: int) -> None:
        """Replace the last estimate with actual output token count."""
        with self._lock:
            now = time.monotonic()
            # Remove the most recent entry matching our estimate
            for i in range(len(self._window) - 1, -1, -1):
                if self._window[i][1] == estimated_tokens:
                    self._window[i] = (self._window[i][0], output_tokens)
                    break


# Shared limiter instance — all extraction modules use the same budget
_shared_limiter = TokenRateLimiter(tokens_per_minute=9000)


def call_anthropic_with_rate_limit(
    client,
    *,
    estimated_output_tokens: int,
    max_retries: int = 3,
    **kwargs,
) -> object:
    """Call client.messages.create() with proactive rate limiting and retries.

    Args:
        client: anthropic.Anthropic instance (should have max_retries=0).
        estimated_output_tokens: Expected output tokens for throttle estimates.
        max_retries: Max retry attempts on 429/529 errors.
        **kwargs: Passed directly to client.messages.create().

    Returns:
        The API response object.

    Raises:
        anthropic.RateLimitError: After exhausting retries on 429.
        anthropic.APIStatusError: On non-retryable API errors.
        Exception: On other failures.
    """
    import anthropic as anthropic_mod

    backoff_schedule = [2, 8, 30]

    _shared_limiter.wait_if_needed(estimated_output_tokens)

    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            response = client.messages.create(**kwargs)
            usage = getattr(response, "usage", None)
            output_tokens = getattr(usage, "output_tokens", None) if usage is not None else None
            actual_tokens = output_tokens if isinstance(output_tokens, int) else estimated_output_tokens
            _shared_limiter.record(actual_tokens, estimated_output_tokens)
            return response
        except anthropic_mod.APIStatusError as e:
            status = getattr(e, "status_code", None)
            if status not in _RETRYABLE_STATUS_CODES:
                # Not retryable — correct the estimate and re-raise
                _shared_limiter.record(0, estimated_output_tokens)
                raise

            last_error = e
            if attempt == max_retries:
                _shared_limiter.record(0, estimated_output_tokens)
                raise

            # Determine wait time
            retry_after = None
            response_headers = getattr(e, "response", None)
            if response_headers is not None:
                headers = getattr(response_headers, "headers", {})
                retry_after = headers.get("retry-after")

            if retry_after and retry_after.isdigit():
                wait = int(retry_after)
            else:
                wait = backoff_schedule[min(attempt - 1, len(backoff_schedule) - 1)]

            logger.warning(
                "Anthropic API %d (attempt %d/%d). Retrying in %ds...",
                status, attempt, max_retries, wait,
            )
            time.sleep(wait)
        except Exception:
            _shared_limiter.record(0, estimated_output_tokens)
            raise

    # Should not reach here, but just in case
    raise last_error  # type: ignore[misc]
