# Scraper V3 Local Dashboard

This dashboard gives a local, read-only operational view of V3 pipeline health using Supabase data.

## What it shows

- Last run status per `source x run_type`
- `running` and recent failed runs
- 24h request/write volume and success rate
- 24h event counts (`inserted`, `price_changed`, `sold`, `removed`, `unchanged`)
- Queue pressure (pending/processing + oldest age)
- Source health counters (`consecutive_unhealthy_runs`, miss candidates)

## Run locally

```bash
cd scraper
source venv/bin/activate
python v3_dashboard.py --port 8787
```

Open:

```text
http://127.0.0.1:8787
```

## Required environment

- `SUPABASE_URL`
- `SUPABASE_KEY`

The script loads `.env` automatically via `python-dotenv`.

## Useful flags

- `--lookback-hours 48` (default `48`)
- `--query-limit 1000` (default `1000`)
- `--refresh-seconds 20` (default `20`)
- `--host 127.0.0.1`
- `--port 8787`

## Endpoints

- `/` HTML dashboard
- `/api/snapshot` raw JSON snapshot
- `/healthz` liveness check
