import sys
from types import SimpleNamespace

import v3.main_v3 as main_v3


class _FakePipeline:
    def __init__(self, *args, **kwargs):
        pass

    def run_detect_source(self, adapter, config):
        if config.source_key == "galle":
            return {
                "run_id": "r1",
                "source": "galle",
                "run_type": "detect",
                "mode": "shadow",
                "status": "error",
                "error": "boom",
            }
        return {
            "run_id": "r2",
            "source": config.source_key,
            "run_type": "detect",
            "mode": "shadow",
            "status": "success",
            "listings": 1,
            "inserted": 0,
            "price_changed": 0,
            "sold": 0,
            "removed": 0,
            "unchanged": 1,
            "detail_fetch_count": 0,
        }

    def run_detail_worker_source(self, adapter, config):
        raise AssertionError("not used")

    def run_reconcile_source(self, adapter, config):
        raise AssertionError("not used")


class _FakeAdapter:
    pass


class _FakeDiffQuery:
    def __init__(self, rows):
        self._rows = rows
        self.captured_run_ids = None

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, column, values):
        assert column == "run_id"
        self.captured_run_ids = list(values)
        return self

    @property
    def not_(self):
        return self

    def is_(self, column, value):
        assert column == "vessel_id"
        assert value == "null"
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _FakeSupabase:
    def __init__(self, rows):
        self.query = _FakeDiffQuery(rows)

    def table(self, name):
        assert name == "scrape_diff_events_v3"
        return self.query


def test_run_pipeline_v3_continues_after_source_error(monkeypatch):
    monkeypatch.setattr("v3.main_v3.PipelineV3", _FakePipeline)
    monkeypatch.setitem(main_v3.ADAPTERS, "galle", _FakeAdapter)
    monkeypatch.setitem(main_v3.ADAPTERS, "rensendriessen", _FakeAdapter)

    results = main_v3.run_pipeline_v3("detect", "shadow", ["galle", "rensendriessen"])

    assert len(results) == 2
    assert any(r["status"] == "error" for r in results)
    assert any(r["status"] == "success" for r in results)


def test_collect_reconcile_post_ingestion_candidates_filters_and_dedupes(monkeypatch):
    fake_supabase = _FakeSupabase(
        [
            {"vessel_id": "v-a", "event_type": "inserted", "payload": {}},
            {"vessel_id": "v-b", "event_type": "unchanged", "payload": {"raw_details": "has details"}},
            {"vessel_id": "v-c", "event_type": "unchanged", "payload": {}},
            {"vessel_id": "v-a", "event_type": "price_changed", "payload": {}},
            {"vessel_id": None, "event_type": "inserted", "payload": {}},
        ]
    )
    monkeypatch.setattr(main_v3, "supabase", fake_supabase)
    results = [
        {"status": "success", "run_type": "reconcile", "run_id": "run-1"},
        {"status": "success", "run_type": "detect", "run_id": "run-2"},
        {"status": "error", "run_type": "reconcile", "run_id": "run-3"},
    ]

    candidates = main_v3._collect_reconcile_post_ingestion_candidates(results)

    assert fake_supabase.query.captured_run_ids == ["run-1"]
    assert candidates == ["v-a", "v-b"]


def test_collect_reconcile_post_ingestion_candidates_returns_none_on_error(monkeypatch):
    class _FailingSupabase:
        def table(self, _name):
            raise RuntimeError("boom")

    monkeypatch.setattr(main_v3, "supabase", _FailingSupabase())
    results = [{"status": "success", "run_type": "reconcile", "run_id": "run-1"}]

    assert main_v3._collect_reconcile_post_ingestion_candidates(results) is None


def test_main_uses_incremental_post_ingestion_scope(monkeypatch):
    monkeypatch.setenv("PIPELINE_V3_MODE", "authoritative")
    monkeypatch.setenv("PIPELINE_V3_NOTIFICATIONS", "off")
    monkeypatch.setenv("PIPELINE_V3_RUN_POST_INGESTION", "on")
    monkeypatch.setenv("PIPELINE_V3_POST_INGESTION_SCOPE", "incremental")

    monkeypatch.setattr(sys, "argv", ["prog", "--run-type", "reconcile"])
    monkeypatch.setattr(
        main_v3,
        "run_pipeline_v3",
        lambda run_type, mode, sources: [{"status": "success", "run_type": "reconcile", "run_id": "run-1"}],
    )
    monkeypatch.setattr(main_v3, "evaluate_v3_run_alerts", lambda _results: None)
    monkeypatch.setattr(main_v3, "_collect_reconcile_post_ingestion_candidates", lambda _results: ["v-1", "v-2"])

    captured = {}

    def _capture_post_ingestion(*, changed_vessel_ids, scope):
        captured["changed_vessel_ids"] = changed_vessel_ids
        captured["scope"] = scope

    monkeypatch.setattr(main_v3, "run_post_ingestion_tasks", _capture_post_ingestion)

    main_v3.main()

    assert captured == {"changed_vessel_ids": ["v-1", "v-2"], "scope": "incremental"}


def test_main_passes_none_candidates_when_incremental_collection_fails(monkeypatch):
    monkeypatch.setenv("PIPELINE_V3_MODE", "authoritative")
    monkeypatch.setenv("PIPELINE_V3_NOTIFICATIONS", "off")
    monkeypatch.setenv("PIPELINE_V3_RUN_POST_INGESTION", "on")
    monkeypatch.setenv("PIPELINE_V3_POST_INGESTION_SCOPE", "incremental")

    monkeypatch.setattr(sys, "argv", ["prog", "--run-type", "reconcile"])
    monkeypatch.setattr(
        main_v3,
        "run_pipeline_v3",
        lambda run_type, mode, sources: [{"status": "success", "run_type": "reconcile", "run_id": "run-1"}],
    )
    monkeypatch.setattr(main_v3, "evaluate_v3_run_alerts", lambda _results: None)
    monkeypatch.setattr(main_v3, "_collect_reconcile_post_ingestion_candidates", lambda _results: None)

    captured = {}

    def _capture_post_ingestion(*, changed_vessel_ids, scope):
        captured["changed_vessel_ids"] = changed_vessel_ids
        captured["scope"] = scope

    monkeypatch.setattr(main_v3, "run_post_ingestion_tasks", _capture_post_ingestion)

    main_v3.main()

    assert captured == {"changed_vessel_ids": None, "scope": "incremental"}


def test_main_uses_full_post_ingestion_scope_by_default(monkeypatch):
    monkeypatch.setenv("PIPELINE_V3_MODE", "authoritative")
    monkeypatch.setenv("PIPELINE_V3_NOTIFICATIONS", "off")
    monkeypatch.setenv("PIPELINE_V3_RUN_POST_INGESTION", "on")
    monkeypatch.delenv("PIPELINE_V3_POST_INGESTION_SCOPE", raising=False)

    monkeypatch.setattr(sys, "argv", ["prog", "--run-type", "reconcile"])
    monkeypatch.setattr(
        main_v3,
        "run_pipeline_v3",
        lambda run_type, mode, sources: [{"status": "success", "run_type": "reconcile", "run_id": "run-1"}],
    )
    monkeypatch.setattr(main_v3, "evaluate_v3_run_alerts", lambda _results: None)

    def _unexpected_collect(_results):
        raise AssertionError("candidate collector should not run when scope is full")

    monkeypatch.setattr(main_v3, "_collect_reconcile_post_ingestion_candidates", _unexpected_collect)

    captured = {}

    def _capture_post_ingestion(*, changed_vessel_ids, scope):
        captured["changed_vessel_ids"] = changed_vessel_ids
        captured["scope"] = scope

    monkeypatch.setattr(main_v3, "run_post_ingestion_tasks", _capture_post_ingestion)

    main_v3.main()

    assert captured == {"changed_vessel_ids": None, "scope": "full"}
