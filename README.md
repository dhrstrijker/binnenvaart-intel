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

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in Supabase credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.
