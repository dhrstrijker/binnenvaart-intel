# Navisio.com UX Audit — Synthesized Feature Backlog

*Date: 2026-02-08*
*Method: 4 independent persona tests via browser automation*

## Personas Tested

| Persona | Role | Focus |
|---------|------|-------|
| Decision Blocker Hunter | Ship broker buying a 1500-2000 DWT tanker | Questions that block a purchase decision |
| Workflow Abandonment Tracker | Fleet owner seeking undervalued vessels | Where the workflow breaks down |
| Comparative Advantage Tester | Veteran buyer who normally calls brokers | What beats picking up the phone |
| Data Quality Auditor | Skeptical analyst | Data gaps and quality issues |

---

## CRITICAL: Build this or nobody pays

*These block the core workflow. Without fixing these, the platform cannot move beyond "free discovery tool."*

### 1. Fix wrong/conflicting data (trust destroyer)

- Anna listed at EUR 1.55M by 3 brokers vs EUR 155K by GTS — 10x error, almost certainly a scraping bug
- Antonie-C shows width of 109.98m (impossible) — parser misreads source
- AIS map shows "EQUITY" on every detail page instead of the actual vessel
- build_year = 0 on some vessels
- **Who needs it:** Data Auditor, all personas. Wrong data is worse than missing data — it destroys trust instantly.
- **Effort:** Data validation layer + scraper bug fixes

### 2. Add technical specs to listings (the 90% data loss problem)

- Navisio shows ~6 fields per vessel. Broker source pages have 50+. The platform strips away engine specs, tank configuration, certificates, draft/air draft, maintenance history, generators, cargo capacity.
- For a EUR 2.2M tanker purchase, engine hours and certificate expiry dates are non-negotiable.
- Every persona hit this wall. The detail page is where users leave for the broker site and never come back.
- **Who needs it:** Decision Blocker (can't evaluate), Workflow Tracker (abandonment point #3), Comparative Tester (reason to keep calling brokers)
- **Effort:** Scrape deeper from broker detail pages — many already have structured data

### 3. Resolve cross-source price conflicts

- Same vessel, different prices across brokers, with no explanation or "primary source" indicator
- Amigos: EUR 2.95M vs EUR 1.35M (EUR 1.6M gap)
- Jericho: EUR 875K vs EUR 925K
- **Who needs it:** Data Auditor, all buyers. Price is the #1 data point — if it's wrong, nothing else matters.
- **Effort:** Deduplication logic + "show all source prices" UI or pick most recent

### 4. Fix data completeness gaps by source

- GTS Schepen: only 10% have tonnage, 14% have build year
- Rensen & Driessen: 0% have tonnage
- ~30% of all listings lack price ("Prijs op aanvraag")
- **Who needs it:** Data Auditor, fleet expander (can't filter/compare incomplete listings)
- **Effort:** Scraper improvements per source + flag incomplete listings in UI

---

## HIGH VALUE: Would convert free users to paid

*These are the features users said they'd pay for. They extend engagement past the discovery phase into evaluation/decision.*

### 5. Unlock a taste of price history for free users

- Price history is the #1 reason to subscribe, but the paywall hits too early
- Workflow Tracker abandoned at this exact point
- Suggestion: show a "price dropped" / "price stable" indicator for free, full chart for Pro
- **Who needs it:** Workflow Tracker (abandonment point #1), Decision Blocker (critical question #6)
- **Willingness to pay:** "I'd pay EUR 19/month if price history showed 6+ months of movements" — Comparative Tester

### 6. Market value / "Deal Score" indicator

- "This vessel is priced 15% below average for its size/type/age"
- Keeps buyers on-platform at the evaluation stage instead of leaving to build their own spreadsheet
- Comparative Tester: "I'd pay EUR 100/month for automated comparable analysis"
- **Who needs it:** Workflow Tracker (proposed this), Comparative Tester (would pay most for this)
- **Effort:** Statistical model on existing price/tonnage/age data — you already have the data

### 7. Sold vessel transaction prices

- "Toon verkochte schepen" exists but doesn't show sale prices
- Knowing comparable vessels sold at X price is the most valuable market intelligence possible
- **Who needs it:** Comparative Tester — "I'd pay EUR 19/month if sold vessel data included approximate transaction prices"
- **Effort:** Track last known price before delisting as proxy

### 8. Expand broker coverage (5 → 15+)

- Only 5 sources covers ~40% of the Dutch market. Missing De Kock, Van de Grift, Schaldemose, Jongenelen, Rhine/Danube brokers
- Comparative Tester: "I'd pay EUR 149/year if Navisio covered 15+ brokers"
- **Who needs it:** All personas — incomplete coverage means you still have to call around
- **Effort:** New scraper development per broker

### 9. Show more photos per listing

- Navisio shows 1 image; brokers have 10-15 (interior, engine room, cargo holds)
- Multiple photos help assess condition without a physical visit
- **Who needs it:** Decision Blocker (nice-to-have #15), all buyers
- **Effort:** Scrape image galleries from broker pages

---

## NICE TO HAVE: Polish but not essential

*Would improve the experience but won't make or break the product.*

### 10. Unlock 1-2 free analytics charts

- Analytics page shows 4 KPIs then locks everything — too aggressive
- Show price distribution by type for free, lock trends/segments for Pro
- **Who needs it:** Workflow Tracker (abandonment point #2)

### 11. Show broker contact details on Navisio

- Currently requires clicking through to broker site to find phone/email
- Surface broker name + contact directly on detail page
- **Who needs it:** Decision Blocker (nice-to-have #14)

### 12. Cross-source comparison for multi-broker listings

- "2 bronnen" badge exists but comparison is Pro-only
- Even showing "Source A: EUR X / Source B: EUR Y" for free would add value
- **Who needs it:** Comparative Tester, Data Auditor

### 13. Fix the /live 404 page

- Green "Live" badge in nav leads to a 404. Visible to every visitor.
- **Who needs it:** Everyone — broken nav link looks unprofessional

### 14. Fix missing vessel images on cards

- Several cards show blank image areas (Via Nova, Avatar, Ferox)
- **Who needs it:** All users — visual browsing is key to engagement

### 15. Normalize data formatting

- Tonnage precision varies: "1095.04t" vs "3102.772t" vs "1400t"
- Consistent rounding/formatting across all sources
- **Who needs it:** Data Auditor

---

## The Core Insight

Navisio's value curve:

```
Discovery ──────────► Evaluation ──────────► Decision ──────────► Contact Broker
   ✅ Strong            ❌ Weak               ❌ Empty              ↗ User leaves
   (filters, search,    (no specs, no         (no deal score,       (to broker site,
    aggregation)          price context)        no comparables)       never returns)
```

The platform loses users at the **evaluation stage** — the exact moment where paid features would be most valuable. Every persona hit this wall. The fix is straightforward: pull more data from broker pages (specs, photos, certificates) and layer on market intelligence (deal scores, price trajectories, comparable sales) that brokers intentionally withhold.

**The ultimate competitive moat:** Brokers will never tell a buyer "this vessel is overpriced" or "the seller dropped the price twice." An aggregator can. That's the feature worth paying for.

---

## Raw Persona Reports

### Decision Blocker Hunter — Full Report

**Ship Examined:** Rea — Tankschip (edible oils tanker), 85.99m x 10m, 1708.88t, build year 1927, asking price EUR 2,200,000. Listed by GSK Brokers. Found via Navisio by filtering Tankschip + 1000-2000t tonnage (7 results out of 447 total).

#### CRITICAL Decision Blockers

1. **No engine/propulsion information** — Broker's page reveals 2x Volvo Penta D16C-DMH (600HP each), built 2019 with 11,000 running hours, CCRII environmental classification. Navisio shows zero engine details.
2. **No tank specifications** — For a tanker, the cargo tank configuration IS the product. Broker reveals: double-walled, 2106m3 capacity, 8 tanks (6 center + 2 wing), 3 sloptanks, steel suction pipes, 2x worm pumps.
3. **No certificate/survey status** — Broker lists: Meetbrief valid to 2039, CVO valid to Oct 2026, CVG expired Nov 2024. The expired CVG is a major red flag invisible on Navisio.
4. **No draft/air draft information** — Broker shows draft of 3.15m and air draft of 5m (without ballast). Determines which routes the vessel can physically sail.
5. **No cargo heating/loading system details** — For edible oils: heated piping system, 8 steel suction lines, 2x worm pumps.
6. **No price history (paywalled)** — Locked behind Pro subscription. Knowing whether price dropped signals seller motivation.
7. **No renovation/maintenance history** — Broker reveals extensive 2019-2025 renovations that transform a "1927 vessel" into something modern. Without this, the build year looks terrible.
8. **No generator/electrical details** — Broker lists 3 generators: Sisu 295kVA, Yanmar 25kVA, Caterpillar 55kVA.
9. **No environmental classification** — Both engines are CCRII classified. Determines future operating permits.

#### NICE-TO-HAVE

10. No Europa number (02302647)
11. No shipyard/origin info
12. No steering/propulsion details (hydraulic steering, 4 rudders, 5-blade propellers, bow thruster)
13. No fuel/water tank capacities (29,000L fuel, 15,000L freshwater)
14. No broker contact details on Navisio (have to click through)
15. Only 1 photo (broker has 11+)
16. Live position map shows wrong vessel ("EQUITY" instead of "REA")

**Overall verdict:** Discovery tool 7/10, purchase decision tool 2/10.

---

### Workflow Abandonment Tracker — Full Report

**Persona:** Fleet owner hunting undervalued 60-80m motor cargo vessels.

#### Abandonment Point #1: Price History Paywall

- **Where:** Any vessel detail page (e.g., Zwarte Zee at EUR 395,000)
- **Trigger:** "Prijsgeschiedenis beschikbaar met Pro" lock. Price history is THE key indicator for finding undervalued vessels.
- **Alternative action:** Go to broker's website or call broker to ask "how long has this been on the market?"
- **Fix:** Show "price dropped" / "price stable" indicator for free, full chart for Pro.

#### Abandonment Point #2: Analytics Page Locked

- **Where:** navisio.nl/analytics
- **Trigger:** 4 summary KPIs visible but ALL charts and drill-down behind paywall. Can't compare market segments.
- **Alternative action:** Build own spreadsheet from broker listings, or call brokers for market comparables.
- **Fix:** Show 1-2 free charts (e.g., price distribution by type), lock deeper analysis for Pro.

#### Abandonment Point #3: Insufficient Technical Specs

- **Where:** Vessel detail pages (e.g., Via Nova — EUR 339,500, 60.1m, 1963, 610t)
- **Trigger:** Only shows name, type, price, dimensions, build year, tonnage, broker. Missing engine, hull survey, cargo hold type, draught, certificates, multiple photos.
- **Alternative action:** Click "Bekijk bij PC Shipbrokers" and leave Navisio entirely.
- **Fix:** Scrape more fields from broker detail pages.

#### Additional bugs found

- /live page returns 404
- Missing images on several vessel cards
- Missing build year/tonnage on some listings
- MarineTraffic embed shows wrong vessel

**Key insight:** Proposed a "Deal Score" feature — even a simple "below/above average price for this size/type" indicator would keep buyers on-platform longer.

---

### Comparative Advantage Tester — Full Report

#### Reasons TO Use Navisio

1. **Cross-broker visibility** — 447 vessels from 5 brokers on one screen (saves a morning of calls)
2. **Market intelligence brokers won't share** — 756 tracked, 37 new/month, 121 days median on market, EUR 10,294/m median
3. **Price history tracking** (Pro) — see if seller dropped price
4. **"First seen" dates** — calculate time on market (brokers hide this)
5. **AIS/Live position** — embedded MarineTraffic (saves separate subscription)
6. **"Show sold ships" filter** — builds comparable transaction database
7. **Saved searches + notifications** — no more weekly broker calls
8. **Similar vessel recommendations** — cross-broker, not just one portfolio
9. **Comprehensive filtering** — type, length, price, tonnage, broker, build year

#### Reasons to Keep Calling Brokers

1. **No technical condition information** at all
2. **No cargo capacity/operational data** (cubic capacity, pump rates, etc.)
3. **No negotiation context** (why selling, bottom line hints)
4. **Relationship value** in a small market (5,000 active vessels, everyone knows everyone)
5. **Data completeness gaps** (missing tonnage, build year on some listings)
6. **Only 5 broker sources** — major brokers missing

#### "I'd Pay For This If..." Statements

- EUR 19/month — if price history showed 6+ months of movements
- EUR 149/year — if it covered 15+ brokers instead of 5
- EUR 50/month — if listings included engine type/hours, survey date, hull thickness, classification
- EUR 19/month — if sold vessel data included approximate transaction prices
- EUR 100/month — for automated "priced 15% above/below comparable vessels" analysis
- Nothing — if data stays at current depth (free tier is enough for basic scanning)

**Bottom line:** Solid market scanning tool. NOT a broker replacement. Biggest opportunity: technical data + broker expansion.

---

### Data Quality Auditor — Full Report

#### CRITICAL Issues

1. **Cross-source price discrepancies** — Anna: EUR 1.55M vs EUR 155K (10x, scraping bug). Amigos: EUR 2.95M vs EUR 1.35M (EUR 1.6M gap). Jericho: EUR 875K vs EUR 925K.
2. **Incorrect dimension data** — Antonie-C width listed as 109.98m (impossible, likely ~11.45m)
3. **AIS map shows wrong vessel** — "EQUITY" appears on multiple detail pages

#### HIGH Issues

4. **Massive completeness gaps by source:**

| Source | Total | Has Tonnage | Has Build Year | Has Price |
|--------|-------|-------------|----------------|-----------|
| Galle | 25 | 100% | 96% | 72% |
| GSK | 198 | 100% | 100% | 55% |
| GTS Schepen | 155 | 10% | 14% | 73% |
| PC Shipbrokers | 152 | 100% | 100% | 80% |
| R&D | 58 | 0% | 100% | 83% |

5. **Invalid data values** — build_year = 0 on some vessels
6. **No descriptions or technical specs** on any listing

#### MEDIUM Issues

7. Price history locked behind paywall
8. Inconsistent formatting (tonnage precision varies wildly)
9. Multi-source deduplication concerns

#### LOW Issues

10. Only 1 photo per listing
11. SPA navigation issues (pages auto-navigate unexpectedly)

**Verdict:** Data is NOT trustworthy enough for professional purchasing decisions. Useful for discovery, fails for decision-support. Most damaging: conflicting prices and wrong dimensions (active misinformation > missing data).
