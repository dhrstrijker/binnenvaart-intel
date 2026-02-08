#!/usr/bin/env python3
"""Fetch all vessel data from Supabase REST API and save as JSON."""

import json
import urllib.request
import os

SUPABASE_URL = "https://alafvkqfqlrznoqmabpf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsYWZ2a3FmcWxyem5vcW1hYnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNzU3MzEsImV4cCI6MjA4NTk1MTczMX0.TwT7srsprCrA7SwY50hf_jRGpejTFq1bgUsaOexFhJw"

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(DATA_DIR, "vessels_raw.json")

# Columns we need
COLUMNS = "id,name,type,source,source_id,price,length_m,width_m,tonnage,build_year,url,image_url,raw_details,first_seen_at,updated_at,scraped_at,canonical_vessel_id"


def fetch_all():
    """Fetch all vessels using pagination (Supabase limits to 1000 per request)."""
    all_rows = []
    offset = 0
    limit = 500

    while True:
        url = f"{SUPABASE_URL}/rest/v1/vessels?select={COLUMNS}&order=id&offset={offset}&limit={limit}"
        req = urllib.request.Request(url)
        req.add_header("apikey", SUPABASE_KEY)
        req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")

        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            all_rows.extend(data)
            print(f"Fetched {len(data)} rows (total: {len(all_rows)})")
            if len(data) < limit:
                break
            offset += limit

    return all_rows


def main():
    print("Fetching vessel data from Supabase...")
    vessels = fetch_all()
    print(f"Total vessels fetched: {len(vessels)}")

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(vessels, f, default=str)
    print(f"Saved to {OUTPUT_FILE}")

    # Print size
    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"File size: {size_mb:.1f} MB")


if __name__ == '__main__':
    main()
