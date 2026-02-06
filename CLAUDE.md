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

- **Scraper**: Python scripts that hit four broker sources, parse vessel data, and upsert into Supabase. Runs automatically via GitHub Actions (twice daily at 08:00 and 20:00 CET) or manually via `python main.py` from `scraper/`.
- **Supabase (cloud DB)**: PostgreSQL database with RLS (Row Level Security). The publishable key allows anonymous reads (frontend). The secret key allows full writes (scraper). Data persists between scraper runs.
- **Frontend (Vercel)**: Next.js app that reads directly from Supabase using the publishable key. No backend/API routes needed. Auto-deploys when you push to `main` on GitHub.

### Data flow

1. GitHub Actions runs `python main.py` twice daily (or you run it manually)
2. Scraper fetches ~375 vessels from 4 broker sources
3. Scraper upserts into Supabase `vessels` table, tracks price changes in `price_history`
4. If changes detected and Resend API key is set, sends email summary to subscribers
5. Frontend on Vercel reads from Supabase on page load (client-side fetch)

### What runs where

| Component | Runs on | Triggered by |
|-----------|---------|--------------|
| Scraper | GitHub Actions | Cron (08:00/20:00 CET) or manual dispatch |
| Supabase DB | Supabase cloud | Always available |
| Frontend | Vercel | Auto-deploy on git push |
| Email notifications | GitHub Actions (via scraper) | Runs after scraper detects changes |

## Project Structure

```
binnenvaart-intel/
├── scraper/                    # Python 3.13 (use venv)
│   ├── venv/                   # Virtual environment (not in git)
│   ├── .env                    # SUPABASE_URL, SUPABASE_KEY (secret), RESEND_API_KEY
│   ├── main.py                 # Entry point - runs all 4 scrapers + notifications
│   ├── db.py                   # Supabase client, upsert logic, change tracking
│   ├── scrape_rensendriessen.py # REST API scraper (POST, ~58 vessels)
│   ├── scrape_galle.py         # HTML scraper (~25 vessels)
│   ├── scrape_pcshipbrokers.py # HTML+JSON scraper (~152 vessels)
│   ├── scrape_gtsschepen.py    # Paginated HTML scraper (~140 vessels)
│   ├── notifications.py       # Resend email notifications
│   ├── tests/                  # pytest unit tests (75 tests)
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

- **vessels**: id (UUID), name, type, length_m, width_m, tonnage, build_year, price, url, image_url, source, source_id, raw_details (JSONB), image_urls (JSONB), scraped_at, first_seen_at, updated_at. UNIQUE(source, source_id).
- **price_history**: id (UUID), vessel_id (FK), price, recorded_at. Tracks every price change.
- **notification_subscribers**: id (UUID), email (UNIQUE), created_at, active. Public signup via frontend.

All tables have RLS enabled. Anonymous read access on all. Anonymous insert on notification_subscribers.

## Data Sources

- **RensenDriessen**: POST `https://api.rensendriessen.com/api/public/ships/brokers/list/filter/` with `{"page": N}`, ~58 vessels. Clean JSON API with ~319 fields per vessel.
- **Galle**: GET `https://gallemakelaars.nl/scheepsaanbod`, single HTML page, ~25 vessels. Parsed with BeautifulSoup.
- **PC Shipbrokers**: GET `https://pcshipbrokers.com/scheepsaanbod`, single page with `compareShipData` JSON embedded in `<script>` tag + HTML cards. ~152 vessels. Detail pages fetched per vessel.
- **GTS Schepen**: GET `https://www.gtsschepen.nl/schepen/`, paginated HTML (~11 pages), ~140 vessels. Card-based layout with `.grid-item` elements. Detail pages fetched per vessel.

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

## CI/CD

- **GitHub Actions CI** (`.github/workflows/ci.yml`): Runs pytest + `npm run build` on push/PR to main
- **Automated scraper** (`.github/workflows/scrape.yml`): Runs `python main.py` at 08:00 and 20:00 CET via cron, also supports manual dispatch
- **Claude Code pre-commit hook** (`.claude/hooks/test-before-commit.sh`): Runs tests before every git commit, blocks commit on failure
- **75 pytest tests** covering all 4 scraper parsing functions (no network calls)
