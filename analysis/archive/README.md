# Analysis SQL Archive

Use this folder for exploratory or one-off SQL artifacts.

Canonical production monitoring SQL lives in:

- `analysis/scraper_v2_baseline_queries.sql`

Archive naming convention:

- `scraper_v2_exploratory_<topic>_<yyyymmdd>.sql`

Each archived query file should include:

1. Purpose and author.
2. Date/time window assumptions.
3. Why it is not part of the canonical baseline query set.
