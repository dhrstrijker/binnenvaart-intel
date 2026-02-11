from pathlib import Path


def test_v2_event_semantics_are_locked_in_migration():
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20260211_scraper_pipeline_v2.sql"
    text = migration.read_text()
    expected = "'inserted', 'price_changed', 'sold', 'removed', 'unchanged'"
    assert expected in text

