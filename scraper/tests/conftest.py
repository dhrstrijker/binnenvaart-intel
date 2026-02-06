import os
import sys

import pytest

# Add scraper directory to Python path so we can import the modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set dummy env vars so db.py can import without real Supabase credentials
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key-not-real")


def pytest_configure(config):
    config.addinivalue_line("markers", "live: hits live broker websites (skipped by default, run with: pytest -m live)")


def pytest_collection_modifyitems(config, items):
    # Skip live tests unless explicitly requested with -m live
    if config.getoption("-m") and "live" in config.getoption("-m"):
        return
    skip_live = pytest.mark.skip(reason="live tests skipped by default (run with: pytest -m live)")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip_live)
