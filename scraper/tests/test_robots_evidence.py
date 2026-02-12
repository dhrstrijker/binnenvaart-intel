from __future__ import annotations

import json
from pathlib import Path

import pytest
import requests

import robots_evidence


class _FakeResponse:
    def __init__(self, *, url: str, status_code: int, content: bytes, headers: dict[str, str], reason: str = "OK"):
        self.url = url
        self.status_code = status_code
        self.content = content
        self.headers = headers
        self.reason = reason


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_resolve_targets_includes_rensen_api_host():
    targets = robots_evidence._resolve_targets("rensendriessen")
    hosts = {target.host for target in targets}
    assert hosts == {"www.rensendriessen.com", "api.rensendriessen.com"}


def test_run_capture_creates_manifest_and_chain(monkeypatch, tmp_path):
    monkeypatch.setattr(robots_evidence, "_run_id_now", lambda: "20260212T120000Z")
    monkeypatch.setattr(robots_evidence, "_iso_utc_now", lambda: "2026-02-12T12:00:00Z")

    def fake_get(url, **_kwargs):
        if url == "https://gallemakelaars.nl/robots.txt":
            return _FakeResponse(
                url=url,
                status_code=200,
                content=b"User-agent: *\nDisallow: /admin\n",
                headers={"Content-Type": "text/plain"},
            )
        if url == "https://www.rensendriessen.com/robots.txt":
            return _FakeResponse(
                url=url,
                status_code=200,
                content=b"User-agent: *\nDisallow:\n",
                headers={"Content-Type": "text/plain"},
            )
        if url == "https://api.rensendriessen.com/robots.txt":
            return _FakeResponse(
                url=url,
                status_code=404,
                content=b"<html>Not Found</html>",
                headers={"Content-Type": "text/html"},
                reason="Not Found",
            )
        raise AssertionError(f"Unexpected URL: {url}")

    exit_code = robots_evidence.run_capture(
        output_root=tmp_path,
        sources_raw="galle,rensendriessen",
        timeout_seconds=10,
        user_agent="TestEvidenceBot/1.0",
        strict_network_errors=True,
        signing_key_path=None,
        tsa_url=None,
        http_get=fake_get,
    )
    assert exit_code == 0

    bundle_dir = tmp_path / "20260212T120000Z"
    manifest = _read_json(bundle_dir / "manifest.json")
    assert manifest["summary"]["target_count"] == 3
    assert manifest["summary"]["success_count"] == 3
    assert manifest["summary"]["network_error_count"] == 0
    assert manifest["summary"]["non_ok_status_count"] == 1

    galle_target = next(item for item in manifest["targets"] if item["host"] == "gallemakelaars.nl")
    assert galle_target["robots_permissions"]["/scheepsaanbod"] is True
    api_target = next(item for item in manifest["targets"] if item["host"] == "api.rensendriessen.com")
    assert api_target["robots_permissions"]["/api/public/ships/brokers/list/filter/"] is None

    checksum_path = bundle_dir / "SHA256SUMS.txt"
    assert checksum_path.exists()
    assert (tmp_path / "chain" / "latest_manifest_sha256.txt").exists()
    ledger = (tmp_path / "chain" / "ledger.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(ledger) == 1


def test_strict_network_errors_returns_nonzero(monkeypatch, tmp_path):
    monkeypatch.setattr(robots_evidence, "_run_id_now", lambda: "20260212T130000Z")
    monkeypatch.setattr(robots_evidence, "_iso_utc_now", lambda: "2026-02-12T13:00:00Z")

    def failing_get(_url, **_kwargs):
        raise requests.ConnectionError("offline")

    exit_code = robots_evidence.run_capture(
        output_root=tmp_path,
        sources_raw="galle",
        timeout_seconds=10,
        user_agent="TestEvidenceBot/1.0",
        strict_network_errors=True,
        signing_key_path=None,
        tsa_url=None,
        http_get=failing_get,
    )
    assert exit_code == 1

    manifest = _read_json(tmp_path / "20260212T130000Z" / "manifest.json")
    assert manifest["summary"]["network_error_count"] == 1
    assert manifest["summary"]["success_count"] == 0


def test_chain_links_previous_manifest_hash(monkeypatch, tmp_path):
    monkeypatch.setattr(robots_evidence, "_iso_utc_now", lambda: "2026-02-12T14:00:00Z")

    run_ids = iter(["20260212T140000Z", "20260212T150000Z"])
    monkeypatch.setattr(robots_evidence, "_run_id_now", lambda: next(run_ids))

    def ok_get(url, **_kwargs):
        return _FakeResponse(
            url=url,
            status_code=200,
            content=b"User-agent: *\nDisallow:\n",
            headers={"Content-Type": "text/plain"},
        )

    first_exit = robots_evidence.run_capture(
        output_root=tmp_path,
        sources_raw="galle",
        timeout_seconds=10,
        user_agent="TestEvidenceBot/1.0",
        strict_network_errors=False,
        signing_key_path=None,
        tsa_url=None,
        http_get=ok_get,
    )
    second_exit = robots_evidence.run_capture(
        output_root=tmp_path,
        sources_raw="galle",
        timeout_seconds=10,
        user_agent="TestEvidenceBot/1.0",
        strict_network_errors=False,
        signing_key_path=None,
        tsa_url=None,
        http_get=ok_get,
    )
    assert first_exit == 0
    assert second_exit == 0

    first_sha = (tmp_path / "20260212T140000Z" / "manifest.sha256").read_text(encoding="utf-8").split()[0]
    second_manifest = _read_json(tmp_path / "20260212T150000Z" / "manifest.json")
    assert second_manifest["previous_manifest_sha256"] == first_sha

    ledger_lines = (tmp_path / "chain" / "ledger.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(ledger_lines) == 2
