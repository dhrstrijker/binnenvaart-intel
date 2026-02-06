import os
import sys

# Add scraper directory to Python path so we can import the modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set dummy env vars so db.py can import without real Supabase credentials
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key-not-real")
