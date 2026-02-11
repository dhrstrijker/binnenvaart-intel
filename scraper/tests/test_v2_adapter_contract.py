from __future__ import annotations

from dataclasses import dataclass

import pytest
import requests

from v2.sources.contracts import (
    REQUIRED_LISTING_FIELDS,
    new_detail_metrics,
    new_listing_metrics,
    validate_detail_metrics,
    validate_listing_metrics,
    validate_listing_rows,
)
from v2.sources.galle_v2 import GalleAdapter
from v2.sources.gsk_v2 import GSKAdapter
from v2.sources.gtsschepen_v2 import GTSSchepenAdapter
from v2.sources.pcshipbrokers_v2 import PCShipbrokersAdapter
from v2.sources.rensendriessen_v2 import RensenDriessenAdapter


def _listing(source: str, source_id: str) -> dict:
    return {
        "source": source,
        "source_id": source_id,
        "name": "Test Vessel",
        "type": "Motorvrachtschip",
        "length_m": 80.0,
        "width_m": 9.5,
        "build_year": 2000,
        "tonnage": 1200.0,
        "price": 500000.0,
        "url": "https://example.com/vessel",
        "image_url": "https://example.com/vessel.jpg",
    }


@dataclass
class _Resp:
    text: str = ""
    payload: dict | list | None = None

    def json(self):
        return self.payload


def _http_error(status_code: int) -> requests.HTTPError:
    err = requests.HTTPError(f"{status_code} error")
    err.response = type("_R", (), {"status_code": status_code})()
    return err


def test_contract_helpers_validate_metrics_and_rows():
    rows = [_listing("galle", "v1")]
    metrics = new_listing_metrics()
    metrics["external_requests"] = 3

    validated_rows = validate_listing_rows("galle", rows)
    validated_metrics = validate_listing_metrics("galle", metrics)
    detail_metrics = validate_detail_metrics("galle", new_detail_metrics())

    assert validated_rows == rows
    assert validated_metrics["external_requests"] == 3
    assert detail_metrics["parse_fail_count"] == 0


def test_contract_rows_require_required_fields():
    row = _listing("galle", "v1")
    row.pop("source_id")
    with pytest.raises(ValueError, match="missing required fields"):
        validate_listing_rows("galle", [row])


def test_all_adapters_expose_owner_constant():
    adapters = [GalleAdapter, RensenDriessenAdapter, PCShipbrokersAdapter, GTSSchepenAdapter, GSKAdapter]
    for adapter in adapters:
        assert getattr(adapter, "owner", "")


def test_galle_adapter_contract(monkeypatch):
    monkeypatch.setattr("v2.sources.galle_v2.fetch_with_retry", lambda *_args, **_kwargs: _Resp(text="<div class='cat-product-small'></div>"))
    monkeypatch.setattr("v2.sources.galle_v2.parse_card", lambda _card: _listing("galle", "g1"))
    monkeypatch.setattr("v2.sources.galle_v2._fetch_detail", lambda _url: {"raw_details": {}, "image_urls": []})

    adapter = GalleAdapter()
    rows, metrics = adapter.scrape_listing()
    vessel, detail_metrics = adapter.enrich_detail(rows[0])

    validate_listing_rows("galle", rows)
    validate_listing_metrics("galle", metrics)
    validate_detail_metrics("galle", detail_metrics)
    assert REQUIRED_LISTING_FIELDS.issubset(rows[0].keys())
    assert vessel["source_id"] == "g1"


def test_rensendriessen_adapter_contract(monkeypatch):
    calls = {"n": 0}

    def fake_fetch(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Resp(payload=[{"id": 1}])
        return _Resp(payload=[])

    monkeypatch.setattr("v2.sources.rensendriessen_v2.fetch_with_retry", fake_fetch)
    monkeypatch.setattr("v2.sources.rensendriessen_v2.parse_vessel", lambda _v: _listing("rensendriessen", "r1"))

    adapter = RensenDriessenAdapter()
    rows, metrics = adapter.scrape_listing()
    vessel, detail_metrics = adapter.enrich_detail(rows[0])

    validate_listing_rows("rensendriessen", rows)
    validate_listing_metrics("rensendriessen", metrics)
    validate_detail_metrics("rensendriessen", detail_metrics)
    assert vessel["source_id"] == "r1"


def test_pcshipbrokers_adapter_contract(monkeypatch):
    monkeypatch.setattr("v2.sources.pcshipbrokers_v2.fetch_with_retry", lambda *_args, **_kwargs: _Resp(text="ok"))
    monkeypatch.setattr("v2.sources.pcshipbrokers_v2._parse_listing", lambda _text: [_listing("pcshipbrokers", "p1")])
    monkeypatch.setattr("v2.sources.pcshipbrokers_v2._fetch_detail", lambda _url: {"raw_details": {}, "image_urls": []})

    adapter = PCShipbrokersAdapter()
    rows, metrics = adapter.scrape_listing()
    vessel, detail_metrics = adapter.enrich_detail(rows[0])

    validate_listing_rows("pcshipbrokers", rows)
    validate_listing_metrics("pcshipbrokers", metrics)
    validate_detail_metrics("pcshipbrokers", detail_metrics)
    assert vessel["source_id"] == "p1"


def test_gtsschepen_adapter_contract(monkeypatch):
    calls = {"n": 0}

    def fake_fetch(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Resp(text="<div class='grid-item'></div>")
        return _Resp(text="")

    monkeypatch.setattr("v2.sources.gtsschepen_v2.MAX_PAGES", 2)
    monkeypatch.setattr("v2.sources.gtsschepen_v2.fetch_with_retry", fake_fetch)
    monkeypatch.setattr("v2.sources.gtsschepen_v2.parse_card", lambda _card: _listing("gtsschepen", "t1"))
    monkeypatch.setattr("v2.sources.gtsschepen_v2._fetch_detail", lambda _url: {"raw_details": {}, "image_urls": []})

    adapter = GTSSchepenAdapter()
    rows, metrics = adapter.scrape_listing()
    vessel, detail_metrics = adapter.enrich_detail(rows[0])

    validate_listing_rows("gtsschepen", rows)
    validate_listing_metrics("gtsschepen", metrics)
    validate_detail_metrics("gtsschepen", detail_metrics)
    assert vessel["source_id"] == "t1"


def test_gtsschepen_404_on_trailing_page_stops_without_error(monkeypatch):
    calls = {"n": 0}

    def fake_fetch(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Resp(text="<div class='grid-item'></div>")
        raise _http_error(404)

    monkeypatch.setattr("v2.sources.gtsschepen_v2.MAX_PAGES", 3)
    monkeypatch.setattr("v2.sources.gtsschepen_v2.fetch_with_retry", fake_fetch)
    monkeypatch.setattr("v2.sources.gtsschepen_v2.parse_card", lambda _card: _listing("gtsschepen", "t1"))

    rows, metrics = GTSSchepenAdapter().scrape_listing()
    assert len(rows) == 1
    assert metrics["external_requests"] == 2


def test_gsk_adapter_contract(monkeypatch):
    calls = {"n": 0}

    def fake_fetch(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return _Resp(payload={"data": {"getVessels": {"totalCount": 1, "vessels": [{"id": "x"}]}}})
        return _Resp(payload={"data": {"getVessels": {"totalCount": 1, "vessels": []}}})

    monkeypatch.setattr("v2.sources.gsk_v2._fetch_with_retry", fake_fetch)
    monkeypatch.setattr("v2.sources.gsk_v2.parse_vessel", lambda _v: _listing("gsk", "k1"))
    monkeypatch.setattr("v2.sources.gsk_v2._fetch_detail", lambda _slug: {"foo": "bar"})
    monkeypatch.setattr("v2.sources.gsk_v2.time.sleep", lambda _v: None)

    adapter = GSKAdapter()
    rows, metrics = adapter.scrape_listing()
    vessel, detail_metrics = adapter.enrich_detail(rows[0])

    validate_listing_rows("gsk", rows)
    validate_listing_metrics("gsk", metrics)
    validate_detail_metrics("gsk", detail_metrics)
    assert vessel["source_id"] == "k1"


@pytest.mark.parametrize(
    ("target", "adapter_cls"),
    [
        ("v2.sources.galle_v2.fetch_with_retry", GalleAdapter),
        ("v2.sources.rensendriessen_v2.fetch_with_retry", RensenDriessenAdapter),
        ("v2.sources.pcshipbrokers_v2.fetch_with_retry", PCShipbrokersAdapter),
        ("v2.sources.gtsschepen_v2.fetch_with_retry", GTSSchepenAdapter),
        ("v2.sources.gsk_v2._fetch_with_retry", GSKAdapter),
    ],
)
def test_adapters_fail_fast_on_non_retryable_status(monkeypatch, target, adapter_cls):
    monkeypatch.setattr(target, lambda *_args, **_kwargs: (_ for _ in ()).throw(_http_error(404)))
    if adapter_cls is GTSSchepenAdapter:
        monkeypatch.setattr("v2.sources.gtsschepen_v2.MAX_PAGES", 1)
    with pytest.raises(requests.HTTPError):
        adapter_cls().scrape_listing()
