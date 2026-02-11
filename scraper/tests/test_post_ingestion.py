import sys
import types

import post_ingestion


def _unexpected(*_args, **_kwargs):
    raise AssertionError("should not be called")


def test_incremental_with_no_candidates_skips_post_ingestion_work(monkeypatch):
    monkeypatch.setattr(post_ingestion, "run_dedup", _unexpected)
    monkeypatch.setattr(post_ingestion, "_load_active_vessels", _unexpected)
    monkeypatch.setitem(sys.modules, "haiku_extract", types.SimpleNamespace(run_extraction=_unexpected))
    monkeypatch.setitem(sys.modules, "structured_extract", types.SimpleNamespace(run_extraction=_unexpected))
    monkeypatch.setitem(sys.modules, "price_model", types.SimpleNamespace(predict_all=_unexpected))

    post_ingestion.run_post_ingestion_tasks(changed_vessel_ids=[], scope="incremental")


def test_incremental_without_candidate_list_falls_back_to_full_scan(monkeypatch):
    calls = {"dedup": 0, "condition": 0, "structured": 0, "predict": 0}
    captured = {"target_ids": "unset"}

    def _run_dedup():
        calls["dedup"] += 1
        return {"clusters": 0, "linked": 0}

    def _load_active_vessels(_select_clause, vessel_ids=None):
        # Fallback path should not use vessel ID targeting.
        assert vessel_ids is None
        return [{"id": "v-1", "name": "Test"}]

    def _run_condition(_vessels):
        calls["condition"] += 1
        return {"extracted": 0, "skipped": 1, "errors": 0}

    def _run_structured(_vessels):
        calls["structured"] += 1
        return {"extracted": 0, "skipped": 1, "errors": 0}

    def _predict(_vessels, target_ids=None):
        calls["predict"] += 1
        captured["target_ids"] = target_ids
        return {"predicted": 0, "suppressed": 0, "errors": 0}

    monkeypatch.setattr(post_ingestion, "run_dedup", _run_dedup)
    monkeypatch.setattr(post_ingestion, "_load_active_vessels", _load_active_vessels)
    monkeypatch.setitem(sys.modules, "haiku_extract", types.SimpleNamespace(run_extraction=_run_condition))
    monkeypatch.setitem(sys.modules, "structured_extract", types.SimpleNamespace(run_extraction=_run_structured))
    monkeypatch.setitem(sys.modules, "price_model", types.SimpleNamespace(predict_all=_predict))

    post_ingestion.run_post_ingestion_tasks(changed_vessel_ids=None, scope="incremental")

    assert calls == {"dedup": 1, "condition": 1, "structured": 1, "predict": 1}
    assert captured["target_ids"] is None
