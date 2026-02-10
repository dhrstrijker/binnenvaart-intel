"""Tests for the token-aware Anthropic API rate limiter."""

import time
from unittest.mock import MagicMock, patch

import pytest

from rate_limiter import TokenRateLimiter, call_anthropic_with_rate_limit


class TestTokenRateLimiter:
    def test_no_sleep_when_under_budget(self):
        limiter = TokenRateLimiter(tokens_per_minute=9000)
        start = time.monotonic()
        limiter.wait_if_needed(500)
        elapsed = time.monotonic() - start
        assert elapsed < 0.5

    def test_multiple_calls_under_budget(self):
        limiter = TokenRateLimiter(tokens_per_minute=9000)
        for _ in range(5):
            limiter.wait_if_needed(1000)
        # 5 * 1000 = 5000, under 9000 budget — should not block
        start = time.monotonic()
        limiter.wait_if_needed(1000)
        elapsed = time.monotonic() - start
        assert elapsed < 0.5

    def test_blocks_when_over_budget(self):
        limiter = TokenRateLimiter(tokens_per_minute=1000)
        # Fill the budget
        limiter.wait_if_needed(800)
        limiter.record(800, 800)

        # Next call would exceed budget — should block
        # We patch time.sleep to avoid actual waiting
        with patch("rate_limiter.time.sleep") as mock_sleep:
            # After sleep, the window entry will still be there (monotonic hasn't advanced)
            # So we need to simulate time passing by manipulating the window
            def advance_time(secs):
                # Clear the window to simulate time passing
                limiter._window.clear()

            mock_sleep.side_effect = advance_time
            limiter.wait_if_needed(500)
            assert mock_sleep.called

    def test_record_replaces_estimate(self):
        limiter = TokenRateLimiter(tokens_per_minute=9000)
        limiter.wait_if_needed(1000)
        # Window should have estimate of 1000
        assert limiter._current_usage(time.monotonic()) == 1000

        limiter.record(300, 1000)
        # After recording actual, usage should be 300
        assert limiter._current_usage(time.monotonic()) == 300

    def test_prune_removes_old_entries(self):
        limiter = TokenRateLimiter(tokens_per_minute=9000)
        # Manually insert an old entry
        old_time = time.monotonic() - 61.0
        limiter._window.append((old_time, 5000))
        assert limiter._current_usage(time.monotonic()) == 0


class TestCallAnthropicWithRateLimit:
    def _make_mock_client(self, response=None):
        client = MagicMock()
        if response is None:
            usage = MagicMock()
            usage.output_tokens = 350
            response = MagicMock()
            response.usage = usage
            response.content = [MagicMock(text='{"result": "ok"}')]
        client.messages.create.return_value = response
        return client

    @patch("rate_limiter._shared_limiter")
    def test_successful_call_records_tokens(self, mock_limiter):
        mock_limiter.wait_if_needed = MagicMock()
        mock_limiter.record = MagicMock()

        client = self._make_mock_client()
        result = call_anthropic_with_rate_limit(
            client,
            estimated_output_tokens=400,
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{"role": "user", "content": "test"}],
        )

        mock_limiter.wait_if_needed.assert_called_once_with(400)
        mock_limiter.record.assert_called_once_with(350, 400)
        assert result.content[0].text == '{"result": "ok"}'

    @patch("rate_limiter._shared_limiter")
    @patch("rate_limiter.time.sleep")
    def test_retries_on_429(self, mock_sleep, mock_limiter):
        import anthropic

        mock_limiter.wait_if_needed = MagicMock()
        mock_limiter.record = MagicMock()

        # Build a proper 429 error
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {}
        rate_err = anthropic.RateLimitError(
            message="rate limited",
            response=mock_response,
            body=None,
        )

        # First call raises 429, second succeeds
        usage = MagicMock()
        usage.output_tokens = 300
        success_response = MagicMock()
        success_response.usage = usage

        client = MagicMock()
        client.messages.create.side_effect = [rate_err, success_response]

        result = call_anthropic_with_rate_limit(
            client,
            estimated_output_tokens=400,
            max_retries=3,
            model="test",
            max_tokens=500,
            messages=[],
        )
        assert result is success_response
        assert mock_sleep.called

    @patch("rate_limiter._shared_limiter")
    def test_raises_after_max_retries(self, mock_limiter):
        import anthropic

        mock_limiter.wait_if_needed = MagicMock()
        mock_limiter.record = MagicMock()

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {}
        rate_err = anthropic.RateLimitError(
            message="rate limited",
            response=mock_response,
            body=None,
        )

        client = MagicMock()
        client.messages.create.side_effect = rate_err

        with patch("rate_limiter.time.sleep"):
            with pytest.raises(anthropic.RateLimitError):
                call_anthropic_with_rate_limit(
                    client,
                    estimated_output_tokens=400,
                    max_retries=2,
                    model="test",
                    max_tokens=500,
                    messages=[],
                )

    @patch("rate_limiter._shared_limiter")
    def test_non_retryable_error_raises_immediately(self, mock_limiter):
        import anthropic

        mock_limiter.wait_if_needed = MagicMock()
        mock_limiter.record = MagicMock()

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.headers = {}
        bad_request = anthropic.BadRequestError(
            message="bad request",
            response=mock_response,
            body=None,
        )

        client = MagicMock()
        client.messages.create.side_effect = bad_request

        with pytest.raises(anthropic.BadRequestError):
            call_anthropic_with_rate_limit(
                client,
                estimated_output_tokens=400,
                model="test",
                max_tokens=500,
                messages=[],
            )
        # Should only have been called once (no retries)
        assert client.messages.create.call_count == 1
