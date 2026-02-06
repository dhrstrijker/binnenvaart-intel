# Binnenvaart Intel

## Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│  Python Scraper  │──────▶│   Supabase DB     │◀───────│  Next.js Frontend   │
│  (runs locally)  │ write  │  (cloud, always   │  read  │  (hosted on Vercel) │
│                  │ via    │   on)             │  via   │                     │
│  scraper/        │ secret │  PostgreSQL +     │ pubkey │  frontend/          │
│                  │ key    │  RLS              │        │                     │
└─────────────────┘        └──────────────────┘        └─────────────────────┘
     manual run                                           auto-deploys on
     on your Mac                                          git push to main
```

### How it works

- **Scraper (local only)**: Python scripts that hit two broker sources, parse vessel data, and upsert into Supabase. Runs manually via `python main.py` from `scraper/`. It does NOT run on Vercel or any server - you run it on your Mac whenever you want fresh data.
- **Supabase (cloud DB)**: PostgreSQL database with RLS (Row Level Security). The publishable key allows anonymous reads (frontend). The secret key allows full writes (scraper). Data persists between scraper runs.
- **Frontend (Vercel)**: Next.js app that reads directly from Supabase using the publishable key. No backend/API routes needed. Auto-deploys when you push to `main` on GitHub.

### Data flow

1. You run `cd scraper && source venv/bin/activate && python main.py`
2. Scraper fetches ~82 vessels from RensenDriessen (API) and Galle (HTML)
3. Scraper upserts into Supabase `vessels` table, tracks price changes in `price_history`
4. If changes detected and Resend API key is set, sends email summary to subscribers
5. Frontend on Vercel reads from Supabase on page load (client-side fetch)

### What runs where

| Component | Runs on | Triggered by |
|-----------|---------|--------------|
| Scraper | Your Mac | Manual: `python main.py` |
| Supabase DB | Supabase cloud | Always available |
| Frontend | Vercel | Auto-deploy on git push |
| Email notifications | Your Mac (via scraper) | Runs after scraper detects changes |

## Project Structure

```
binnenvaart-intel/
├── scraper/                    # Python 3.13 (use venv)
│   ├── venv/                   # Virtual environment (not in git)
│   ├── .env                    # SUPABASE_URL, SUPABASE_KEY (secret), RESEND_API_KEY
│   ├── main.py                 # Entry point - runs both scrapers + notifications
│   ├── db.py                   # Supabase client, upsert logic, change tracking
│   ├── scrape_rensendriessen.py # REST API scraper (POST, 7 pages, ~57 vessels)
│   ├── scrape_galle.py         # HTML scraper (BeautifulSoup, ~25 vessels)
│   ├── notifications.py       # Resend email notifications
│   └── requirements.txt
├── frontend/                   # Next.js 16 + Tailwind v4 + TypeScript
│   ├── .env.local              # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
│   ├── src/app/
│   │   ├── page.tsx            # Dashboard page (main)
│   │   └── analytics/page.tsx  # Market analytics page
│   ├── src/components/
│   │   ├── Dashboard.tsx       # Vessel grid with filters + price history
│   │   ├── VesselCard.tsx      # Individual vessel card with trend indicators
│   │   ├── VesselDetail.tsx    # Detail modal with price history chart
│   │   ├── PriceHistoryChart.tsx # SVG sparkline + mini sparkline
│   │   ├── Filters.tsx         # Search, type, source, price, sort filters
│   │   ├── NavLink.tsx         # Shared navigation component
│   │   ├── NotificationSignup.tsx # Email subscription form
│   │   └── analytics/          # Market analytics chart components
│   │       ├── MarketOverview.tsx
│   │       ├── PriceDistribution.tsx
│   │       ├── TypeBreakdown.tsx
│   │       ├── PriceTrends.tsx
│   │       └── SourceComparison.tsx
│   └── src/lib/supabase.ts     # Supabase client + Vessel/PriceHistory types
└── supabase/
    └── schema.sql              # Full DB schema (vessels, price_history, notification_subscribers)
```

## Database Schema

Three tables in Supabase (project: `alafvkqfqlrznoqmabpf`):

- **vessels**: id (UUID), name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, scraped_at, first_seen_at, updated_at. UNIQUE(source, source_id).
- **price_history**: id (UUID), vessel_id (FK), price, recorded_at. Tracks every price change.
- **notification_subscribers**: id (UUID), email (UNIQUE), created_at, active. Public signup via frontend.

All tables have RLS enabled. Anonymous read access on all. Anonymous insert on notification_subscribers.

## Data Sources

- **RensenDriessen**: POST `https://api.rensendriessen.com/api/public/ships/brokers/list/filter/` with `{"page": N}`, pages 1-7, ~57 vessels. Clean JSON response.
- **Galle**: GET `https://gallemakelaars.nl/scheepsaanbod`, single HTML page, ~25 vessels. Parsed with BeautifulSoup.

## Column Naming Convention

All code must use these exact column names (not alternatives):
- `type` (not `ship_type`)
- `length_m` / `width_m` (not `length`/`width`/`beam_m`)
- `price` (not `price_eur`) - always EUR, no currency field
- `build_year`, `scraped_at`, `first_seen_at`, `updated_at`
- UUID primary keys (not BIGINT)

## Supabase Key Naming (2025+)

Supabase renamed their keys:
- `anon` key is now `publishable` key (format: `sb_publishable_...`)
- `service_role` key is now `secret` key (format: `sb_secret_...`)
- Env vars still use the old names (`SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) - this is fine

## Commands

```bash
# Run scraper (from project root)
cd scraper && source venv/bin/activate && python main.py

# Run frontend locally
cd frontend && npm run dev

# Deploy frontend (auto on git push, or manual)
cd frontend && vercel --prod

# Build check
cd frontend && npm run build
```

## Environment Variables

### scraper/.env
```
SUPABASE_URL=https://alafvkqfqlrznoqmabpf.supabase.co
SUPABASE_KEY=sb_secret_...        # Secret key (full DB access)
RESEND_API_KEY=re_...              # Optional, for email notifications
```

### frontend/.env.local
```
NEXT_PUBLIC_SUPABASE_URL=https://alafvkqfqlrznoqmabpf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...  # Publishable key (read-only)
```

## Future Considerations

The scraper currently runs manually. To automate it, options include:
- **Cron job** on your Mac (launchd or crontab)
- **GitHub Actions** scheduled workflow (free, runs in CI)
- **Supabase Edge Function** with pg_cron (runs in cloud, would need rewrite to TypeScript/Deno)
- **Railway/Render** background worker (small always-on server)
