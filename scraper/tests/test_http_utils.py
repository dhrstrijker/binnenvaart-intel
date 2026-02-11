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
