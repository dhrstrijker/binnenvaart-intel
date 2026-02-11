from v2.sources.pagination import resolve_listing_page_cap


def test_resolve_listing_page_cap_uses_default_without_env(monkeypatch):
    monkeypatch.delenv("PIPELINE_V3_MAX_LISTING_PAGES", raising=False)
    monkeypatch.delenv("PIPELINE_V3_MAX_LISTING_PAGES_GTSSCHEPEN", raising=False)
    assert resolve_listing_page_cap("gtsschepen", default_cap=20) == 20


def test_resolve_listing_page_cap_prefers_source_specific_override(monkeypatch):
    monkeypatch.setenv("PIPELINE_V3_MAX_LISTING_PAGES", "12")
    monkeypatch.setenv("PIPELINE_V3_MAX_LISTING_PAGES_GTSSCHEPEN", "8")
    assert resolve_listing_page_cap("gtsschepen", default_cap=20) == 8


def test_resolve_listing_page_cap_clamps_to_default_cap(monkeypatch):
    monkeypatch.setenv("PIPELINE_V3_MAX_LISTING_PAGES", "50")
    assert resolve_listing_page_cap("rensendriessen", default_cap=20) == 20


def test_resolve_listing_page_cap_ignores_invalid_values(monkeypatch):
    monkeypatch.setenv("PIPELINE_V3_MAX_LISTING_PAGES", "abc")
    assert resolve_listing_page_cap("gsk", default_cap=10) == 10
