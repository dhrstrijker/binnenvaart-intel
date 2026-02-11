from dataclasses import fields

from v3.config import DEFAULT_SOURCE_CONFIGS_V3, SOURCE_ADAPTER_OWNERS_V3, SourceConfigV3


def test_source_config_v3_shape_is_locked():
    field_names = [f.name for f in fields(SourceConfigV3)]
    assert field_names == [
        "source_key",
        "listing_page_size",
        "retry_policy",
        "detail_fetch_policy",
        "max_consecutive_misses_for_removed",
        "health_thresholds",
        "detail_worker_batch_size",
    ]


def test_source_configs_and_owners_are_aligned():
    assert set(DEFAULT_SOURCE_CONFIGS_V3.keys()) == set(SOURCE_ADAPTER_OWNERS_V3.keys())



def test_all_sources_use_new_or_changed_detail_policy():
    for cfg in DEFAULT_SOURCE_CONFIGS_V3.values():
        assert cfg.detail_fetch_policy in {"always", "new_or_changed"}
        assert cfg.max_consecutive_misses_for_removed >= 1
        assert cfg.detail_worker_batch_size >= 1
