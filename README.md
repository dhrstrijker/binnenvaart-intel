# Binnenvaart Intel

Market intelligence dashboard for Dutch inland shipping (binnenvaart) vessels. Scrapes broker listings, tracks prices over time, and displays everything in a web dashboard.

## Architecture

- **scraper/** - Python scraper that pulls vessel listings from Dutch brokers (RensenDriessen, Galle) and stores them in Supabase
- **frontend/** - Next.js dashboard showing vessels, price history, and market trends
- **supabase/** - Database schema (vessels, price_history tables with RLS)

## Setup

### Database

1. Create a [Supabase](https://supabase.com) project
2. Run `supabase/schema.sql` in the SQL editor

### Scraper

```bash
cd scraper
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in Supabase credentials
python main.py
```

#### Scraper v2 (authoritative/shadow)

`main.py` runs the V2 pipeline. Configure mode and source scope with env flags:

```bash
PIPELINE_V2_MODE=shadow \
PIPELINE_V2_NOTIFICATIONS=off \
PIPELINE_V2_SOURCES=galle \
python main.py
```

- `PIPELINE_V2_MODE=shadow|authoritative`
- `PIPELINE_V2_NOTIFICATIONS=off|on`
- `PIPELINE_V2_SOURCES` is a comma-separated source allowlist

V2 operational docs:

- `docs/scraper_v2_pipeline.md`
- `docs/scraper_v2_cleanup_plan.md`

#### Scraper v3 (detect/detail-worker/reconcile)

V3 runs as a sidecar pipeline with three run types:

- `detect` (every 15 minutes target cadence)
- `detail-worker` (every 15 minutes target cadence)
- `reconcile` (every 6 hours target cadence)

Local examples:

```bash
# detect
PIPELINE_V3_MODE=shadow \
PIPELINE_V3_NOTIFICATIONS=off \
PIPELINE_V3_SOURCES=galle \
python v3/main_v3.py --run-type detect

# detail worker
PIPELINE_V3_MODE=shadow \
PIPELINE_V3_NOTIFICATIONS=off \
PIPELINE_V3_SOURCES=galle \
python v3/main_v3.py --run-type detail-worker

# reconcile
PIPELINE_V3_MODE=shadow \
PIPELINE_V3_NOTIFICATIONS=off \
PIPELINE_V3_SOURCES=galle \
python v3/main_v3.py --run-type reconcile
```

- `PIPELINE_V3_MODE=shadow|authoritative`
- `PIPELINE_V3_NOTIFICATIONS=off|on`
- `PIPELINE_V3_SOURCES` comma-separated source allowlist
- `PIPELINE_V3_DETAIL_BUDGET_PER_RUN` batch budget for detail-worker
- `PIPELINE_V3_MAX_QUEUE_AGE_MINUTES` backlog threshold metric input
- `PIPELINE_V3_RECONCILE_REMOVE_MISSES` consecutive healthy misses required for `removed`

V3 operational docs:

- `docs/scraper_v3_pipeline.md`

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in Supabase credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.
