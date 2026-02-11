from dataclasses import fields

from v2.config import DEFAULT_SOURCE_CONFIGS, SOURCE_ADAPTER_OWNERS, SourceConfig


def test_source_config_shape_is_frozen():
    field_names = [f.name for f in fields(SourceConfig)]
    assert field_names == [
        "source_key",
        "listing_page_size",
        "retry_policy",
        "detail_fetch_policy",
        "max_consecutive_misses_for_removed",
        "health_thresholds",
    ]


def test_source_configs_cover_all_adapters_with_owners():
    configured_sources = set(DEFAULT_SOURCE_CONFIGS.keys())
    owner_sources = set(SOURCE_ADAPTER_OWNERS.keys())
    assert configured_sources == owner_sources
    assert all(SOURCE_ADAPTER_OWNERS[source] for source in configured_sources)

