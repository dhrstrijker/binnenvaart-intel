import http_utils
from unittest.mock import Mock, patch

import pytest
import requests

from http_utils import fetch_with_retry


class _Resp:
    def __init__(self, status_code=200, headers=None):
        self.status_code = status_code
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            err = requests.HTTPError(f"{self.status_code} error")
            err.response = self
            raise err


class TestFetchWithRetry:
    @pytest.fixture(autouse=True)
    def _reset_http_utils_state(self, monkeypatch):
        monkeypatch.delenv("SCRAPER_HTTP_MIN_INTERVAL_SECONDS", raising=False)
        monkeypatch.delenv("SCRAPER_HTTP_MIN_INTERVAL_BY_HOST", raising=False)
        monkeypatch.delenv("SCRAPER_HTTP_JITTER_RATIO", raising=False)
        monkeypatch.delenv("SCRAPER_HTTP_JITTER_MAX_SECONDS", raising=False)
        monkeypatch.delenv("SCRAPER_HTTP_RESPECT_ROBOTS", raising=False)
        http_utils._LAST_SCHEDULED_AT_BY_HOST.clear()
        http_utils._ROBOTS_CRAWL_DELAY_CACHE.clear()

    def test_retries_on_429_then_succeeds(self):
        first = _Resp(status_code=429, headers={"Retry-After": "1"})
        second = _Resp(status_code=200)
        first_err = requests.HTTPError("429")
        first_err.response = first
        method = Mock(side_effect=[first_err, second])

        with patch("http_utils.time.sleep") as mock_sleep:
            result = fetch_with_retry(method, "https://example.com", retries=3)

        assert result.status_code == 200
        assert method.call_count == 2
        assert mock_sleep.called

    def test_fails_fast_on_404(self):
        resp = _Resp(status_code=404)
        err = requests.HTTPError("404")
        err.response = resp
        method = Mock(side_effect=err)

        with patch("http_utils.time.sleep") as mock_sleep:
            with pytest.raises(requests.HTTPError):
                fetch_with_retry(method, "https://example.com", retries=3)

        assert method.call_count == 1
        mock_sleep.assert_not_called()

    def test_retries_then_raises_on_network_errors(self):
        method = Mock(side_effect=requests.ConnectionError("down"))

        with patch("http_utils.time.sleep") as mock_sleep:
            with pytest.raises(requests.ConnectionError):
                fetch_with_retry(method, "https://example.com", retries=2)

        assert method.call_count == 2
        assert mock_sleep.call_count == 1

    def test_applies_host_politeness_spacing(self, monkeypatch):
        monkeypatch.setenv("SCRAPER_HTTP_MIN_INTERVAL_SECONDS", "1.0")
        monkeypatch.setenv("SCRAPER_HTTP_JITTER_RATIO", "0")
        monkeypatch.setenv("SCRAPER_HTTP_JITTER_MAX_SECONDS", "0")

        method = Mock(side_effect=[_Resp(status_code=200), _Resp(status_code=200)])

        with patch("http_utils.time.monotonic", side_effect=[0.0, 0.0]), patch("http_utils.time.sleep") as mock_sleep:
            fetch_with_retry(method, "https://example.com/a", retries=1)
            fetch_with_retry(method, "https://example.com/b", retries=1)

        assert method.call_count == 2
        mock_sleep.assert_called_once_with(1.0)

    def test_retries_on_503_with_stronger_backoff(self):
        first = _Resp(status_code=503)
        second = _Resp(status_code=200)
        first_err = requests.HTTPError("503")
        first_err.response = first
        method = Mock(side_effect=[first_err, second])

        with patch("http_utils.time.sleep") as mock_sleep:
            result = fetch_with_retry(method, "https://example.com", retries=3)

        assert result.status_code == 200
        assert method.call_count == 2
        assert mock_sleep.call_args_list[-1].args[0] == 7
