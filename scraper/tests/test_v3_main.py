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


def test_run_pipeline_v3_continues_after_source_error(monkeypatch):
    monkeypatch.setattr("v3.main_v3.PipelineV3", _FakePipeline)
    monkeypatch.setitem(main_v3.ADAPTERS, "galle", _FakeAdapter)
    monkeypatch.setitem(main_v3.ADAPTERS, "rensendriessen", _FakeAdapter)

    results = main_v3.run_pipeline_v3("detect", "shadow", ["galle", "rensendriessen"])

    assert len(results) == 2
    assert any(r["status"] == "error" for r in results)
    assert any(r["status"] == "success" for r in results)
