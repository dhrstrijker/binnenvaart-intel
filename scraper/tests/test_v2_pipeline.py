from unittest.mock import Mock

from v2.config import DEFAULT_SOURCE_CONFIGS
from v2.fingerprint import make_fingerprint
from v2.pipeline import PipelineV2


class _Resp:
    def __init__(self, data=None):
        self.data = data


class _RpcOp:
    def __init__(self, data=None):
        self._data = data

    def execute(self):
        return _Resp(self._data)


class _TableOp:
    def __init__(self, data=None):
        self._data = data

    def insert(self, *_args, **_kwargs):
        return self

    def upsert(self, *_args, **_kwargs):
        return self

    def update(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def select(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _Resp(self._data)


class _FakeSupabase:
    def __init__(self):
        self.table_calls = []
        self.rpc_calls = []

    def table(self, name):
        self.table_calls.append(name)
        if name == "vessels":
            return _TableOp(data=[])
        if name == "scrape_runs_v2":
            return _TableOp(data=[{"id": "run-1"}])
        return _TableOp(data=[])

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        if name == "compute_scrape_diff":
            return _RpcOp(
                data=[
                    {"event_type": "inserted"},
                    {"event_type": "unchanged"},
                ]
            )
        if name == "mark_missing_candidates":
            return _RpcOp(data=1)
        if name == "apply_scrape_diff":
            return _RpcOp(data={"event_counts": {"inserted": 1}})
        return _RpcOp(data=None)


class _Adapter:
    source_key = "galle"

    def __init__(self):
        self.detail_calls = 0

    def scrape_listing(self):
        return ([
            {
                "source": "galle",
                "source_id": "v1",
                "name": "V1",
                "type": None,
                "length_m": 85.0,
                "width_m": 9.5,
                "build_year": None,
                "tonnage": None,
                "price": 100000.0,
                "url": "https://example.com/v1",
                "image_url": "https://example.com/v1.jpg",
            }
        ], {"external_requests": 1, "parse_fail_count": 0, "selector_fail_count": 0})

    def enrich_detail(self, listing_row):
        self.detail_calls += 1
        row = dict(listing_row)
        row["raw_details"] = {"k": "v"}
        row["image_urls"] = ["https://example.com/v1.jpg"]
        return row, {"external_requests": 1, "parse_fail_count": 0}


def test_shadow_mode_skips_apply(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr("v2.pipeline.supabase", fake)

    pipeline = PipelineV2(mode="shadow")
    adapter = _Adapter()
    config = DEFAULT_SOURCE_CONFIGS["galle"]

    result = pipeline.run_source(adapter, config)

    rpc_names = [name for name, _ in fake.rpc_calls]
    assert "compute_scrape_diff" in rpc_names
    assert "mark_missing_candidates" in rpc_names
    assert "apply_scrape_diff" not in rpc_names
    assert result["inserted"] == 1
    assert result["unchanged"] == 1


def test_detail_fetch_policy_new_or_changed(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr("v2.pipeline.supabase", fake)

    pipeline = PipelineV2(mode="shadow")
    adapter = _Adapter()

    original = adapter.scrape_listing()[0][0]
    listing_fp = make_fingerprint(pipeline._listing_shape(original))

    monkeypatch.setattr(pipeline, "_read_existing_fingerprints", Mock(return_value={"v1": listing_fp}))

    config = DEFAULT_SOURCE_CONFIGS["galle"]
    pipeline.run_source(adapter, config)

    assert adapter.detail_calls == 0


def test_health_summary_marks_unhealthy_on_parse_fail_ratio():
    summary = PipelineV2._build_health_summary(
        thresholds={
            "max_parse_fail_ratio": 0.10,
            "max_selector_fail_count": 3,
            "min_page_coverage_ratio": 0.65,
        },
        parse_fail_ratio=0.25,
        selector_fail_count=0,
        page_coverage_ratio=1.0,
    )
    assert summary["is_healthy"] is False
    assert summary["health_score"] < 1.0


def test_health_summary_marks_healthy_within_thresholds():
    summary = PipelineV2._build_health_summary(
        thresholds={
            "max_parse_fail_ratio": 0.10,
            "max_selector_fail_count": 3,
            "min_page_coverage_ratio": 0.65,
        },
        parse_fail_ratio=0.05,
        selector_fail_count=1,
        page_coverage_ratio=0.90,
    )
    assert summary["is_healthy"] is True
    assert 0.0 <= summary["health_score"] <= 1.0
