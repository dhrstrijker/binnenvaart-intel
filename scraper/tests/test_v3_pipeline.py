from v3.config import DEFAULT_SOURCE_CONFIGS_V3
from v3.pipeline import PipelineV3


class _Resp:
    def __init__(self, data=None):
        self.data = data


class _RpcOp:
    def __init__(self, data=None):
        self._data = data

    def execute(self):
        return _Resp(self._data)


class _TableOp:
    def __init__(self, data=None, log_calls=None, table_name=None):
        self._data = data
        self._log_calls = log_calls
        self._table_name = table_name

    def insert(self, *_args, **_kwargs):
        if self._log_calls is not None:
            self._log_calls.append(("table.insert", self._table_name))
        return self

    def upsert(self, *_args, **_kwargs):
        if self._log_calls is not None:
            self._log_calls.append(("table.upsert", self._table_name))
        return self

    def update(self, *_args, **_kwargs):
        if self._log_calls is not None:
            self._log_calls.append(("table.update", self._table_name))
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _Resp(self._data)


class _FakeSupabase:
    def __init__(self):
        self.rpc_calls = []
        self.call_order = []

    def table(self, name):
        self.call_order.append(("table", name))
        if name == "vessels":
            return _TableOp(data=[], log_calls=self.call_order, table_name=name)
        if name == "scrape_runs_v3":
            return _TableOp(data=[{"id": "run-1"}], log_calls=self.call_order, table_name=name)
        return _TableOp(data=[], log_calls=self.call_order, table_name=name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        self.call_order.append(("rpc", name))
        if name == "compute_scrape_diff_v3":
            return _RpcOp(data=[{"event_type": "inserted"}, {"event_type": "unchanged"}])
        if name == "enqueue_detail_candidates_v3":
            return _RpcOp(data=1)
        if name == "mark_missing_candidates_v3":
            return _RpcOp(data=1)
        if name == "apply_scrape_diff_v3":
            return _RpcOp(data={"event_counts": {"inserted": 1}})
        return _RpcOp(data=None)


class _Adapter:
    source_key = "galle"

    def scrape_listing(self):
        return (
            [
                {
                    "source": "galle",
                    "source_id": "v1",
                    "name": "V1",
                    "type": None,
                    "length_m": 80.0,
                    "width_m": 9.5,
                    "build_year": None,
                    "tonnage": None,
                    "price": 100000.0,
                    "url": "https://example.com/v1",
                    "image_url": "https://example.com/v1.jpg",
                    "is_sold": False,
                }
            ],
            {
                "external_requests": 1,
                "parse_fail_count": 0,
                "selector_fail_count": 0,
                "page_coverage_ratio": 1.0,
            },
        )

    def enrich_detail(self, listing_row):
        row = dict(listing_row)
        row["raw_details"] = {"k": "v"}
        row["image_urls"] = ["https://example.com/v1.jpg"]
        return row, {"external_requests": 1, "parse_fail_count": 0}



def test_v3_detect_shadow_skips_apply(monkeypatch):
    fake = _FakeSupabase()
    update_calls = []

    monkeypatch.setattr("v3.pipeline.supabase", fake)
    monkeypatch.setattr("v3.pipeline.queue_depth_and_oldest_age_minutes", lambda _source: (0, None))
    monkeypatch.setattr("v3.pipeline.update_run_v3", lambda run_id, patch: update_calls.append((run_id, patch)))

    pipeline = PipelineV3(mode="shadow")
    result = pipeline.run_detect_source(_Adapter(), DEFAULT_SOURCE_CONFIGS_V3["galle"])

    rpc_names = [name for name, _ in fake.rpc_calls]
    assert "compute_scrape_diff_v3" in rpc_names
    assert "enqueue_detail_candidates_v3" in rpc_names
    assert "apply_scrape_diff_v3" not in rpc_names
    assert result["status"] == "success"
    assert result["inserted"] == 1
    assert result["unchanged"] == 1
    assert update_calls



def test_v3_reconcile_updates_metadata_before_mark_missing(monkeypatch):
    fake = _FakeSupabase()
    call_order = []

    def _update_run(run_id, patch):
        call_order.append(("update_run_v3", run_id, patch))

    monkeypatch.setattr("v3.pipeline.supabase", fake)
    monkeypatch.setattr("v3.pipeline.queue_depth_and_oldest_age_minutes", lambda _source: (0, None))
    monkeypatch.setattr("v3.pipeline.update_run_v3", _update_run)

    pipeline = PipelineV3(mode="shadow")
    result = pipeline.run_reconcile_source(_Adapter(), DEFAULT_SOURCE_CONFIGS_V3["galle"])

    mark_missing_idx = fake.call_order.index(("rpc", "mark_missing_candidates_v3"))
    metadata_update_idx = next(
        idx
        for idx, entry in enumerate(call_order)
        if entry[0] == "update_run_v3" and "metadata" in entry[2]
    )
    assert metadata_update_idx < mark_missing_idx
    assert result["status"] == "success"
