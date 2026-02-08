# Price Drivers Analysis - Binnenvaart Intel

**Date**: 2026-02-08
**Dataset**: 391 priced vessels (388 after excluding 3 outliers: Wendy, Pelagus, Porthos)
**Sources**: PC Shipbrokers (122), GSK (115), GTS Schepen (88), Rensen Driessen (57), Galle (9)

---

## 1. Correlation Analysis

**Chart**: `analysis/charts/correlation_heatmap.png`

### Key Correlations with Price

| Feature | Correlation | Sample Size |
|---------|------------|-------------|
| price_per_meter | +0.912 | 388 |
| tonnage | +0.807 | 354 |
| fuel_tank_liters | +0.766 | 170 |
| width_m | +0.715 | 388 |
| build_year | +0.714 | 374 |
| length_m | +0.678 | 388 |
| bow_thruster_hp | +0.642 | 214 |
| engine_power_hp | +0.634 | 266 |
| generator_kva | +0.443 | 259 |
| engine_hours | +0.142 | 200 |
| price_per_ton | +0.059 | 354 |
| num_holds | -0.161 | 145 |
| days_on_market | -0.254 | 339 |
| vessel_age | -0.714 | 374 |

### Key Findings

- **Size matters most**: Tonnage (+0.807), width (+0.715), and length (+0.678) are the strongest physical predictors. Larger vessels command significantly higher prices.
- **Age is the top negative driver**: vessel_age (-0.714) / build_year (+0.714) show that newer vessels are worth substantially more.
- **Engine hours barely matter** at the aggregate level: only +0.142 correlation with price. This is because engine hours correlate with vessel size (larger vessels accumulate more hours), masking the true depreciation effect.
- **Price_per_ton is meaningless as a price predictor** (+0.059): it normalizes out size effects, making it useful for comparison but not prediction.
- **Days on market** shows a weak negative correlation (-0.254), suggesting higher-priced vessels may take slightly longer to sell, though this dataset has limited variation in days_on_market.

---

## 2. Regression Model Results

**Chart**: `analysis/charts/feature_importance.png`

### Model: Gradient Boosting Regressor

- **Sample size**: n=176 (after dropping rows with NaN in key features)
- **WARNING**: n < 300 due to 48.5% missing engine_hours and 31.4% missing engine_power_hp. Overfitting risk is elevated.
- **Missing value strategy**: Dropped rows with any NaN in model features (length_m, tonnage, build_year, engine_hours, engine_power_hp). This was chosen over imputation to avoid introducing bias, at the cost of reduced sample size.

### Performance

| Metric | Value |
|--------|-------|
| 5-Fold CV R² (mean) | 0.830 |
| 5-Fold CV R² (std) | 0.056 |
| Per-fold R² | 0.860, 0.772, 0.791, 0.926, 0.800 |
| Train R² | 0.974 |

The gap between train R² (0.974) and CV R² (0.830) confirms moderate overfitting, expected with n=176. Despite this, the model explains ~83% of price variance in cross-validation, which is strong.

### Feature Importance (Gini)

| Feature | Importance |
|---------|-----------|
| build_year | 0.436 |
| length_m | 0.308 |
| tonnage | 0.172 |
| engine_power_hp | 0.034 |
| type_Motorvrachtschip | 0.023 |
| engine_hours | 0.013 |
| Other type/source dummies | < 0.01 each |

### Interpretation

- **Build year alone explains 44% of the model's predictive power**. Age is the single most important price determinant.
- **Length (31%) and tonnage (17%)** together explain nearly half -- physical size is the second pillar of pricing.
- **Engine hours contribute only 1.3%** to the GBM model. After controlling for size and age, engine hours have minimal predictive value.
- **Vessel type and source** contribute very little beyond what size and age already capture.

---

## 3. Engine Hours Deep Dive

**Chart**: `analysis/charts/engine_hours_vs_price.png`

### Overview

- 200 vessels have both engine_hours and price data (51% of priced set)
- Dominated by Motorvrachtschip (147), Tankschip (19), Beunschip (14)

### Within-Type Analysis: Motorvrachtschip (n=147)

- Raw correlation (engine_hours, price): **+0.311**
- This POSITIVE correlation is counterintuitive but explained by confounding: larger/newer Motorvrachtschip have both higher prices AND more accumulated engine hours because they operate more intensively.

### Partial Dependence (controlling for size and age)

Using the GBM model's partial dependence:

- **Estimated price effect of 10,000 additional engine hours: -7,126 EUR**
- Range analyzed: 4,807 to 81,750 hours
- This is a very modest effect. An additional 10,000 hours of engine wear reduces expected price by only ~7,100 EUR -- roughly 0.5% of the average vessel price.

**Conclusion**: Engine hours are a weak price signal in the inland vessel market. Buyers appear to value size and age far more than operational wear. This may reflect that engines are regularly overhauled/replaced, making accumulated hours less meaningful.

### Sweet Spot Vessels

Vessels with below-median engine hours AND below-median price-per-ton for their type (48 found). Top prospects:

| Vessel | Type | Price | Engine Hours | EUR/ton |
|--------|------|-------|-------------|---------|
| Serval | Motorvrachtschip | 125,000 | 29,728 | 143 |
| The-An I | Motorvrachtschip | 145,000 | 23,000 | 190 |
| Wijnanda | Motorvrachtschip | 110,000 | 4,756 | 213 |
| Pitbull | Koppelverband | 90,000 | 24,277 | 245 |
| Aldeano | Motorvrachtschip | 350,000 | 30,000 | 257 |
| Disponible | Motorvrachtschip | 169,000 | 9,250 | 258 |
| Celeritas | Motorvrachtschip | 95,000 | 12,500 | 259 |
| Honte | Beunschip | 250,000 | 5,332 | 280 |
| Elsa | Motorvrachtschip | 165,000 | 22,300 | 287 |
| Radar | Motorvrachtschip | 340,000 | 3,850 | 321 |
| Corma B | Motorvrachtschip | 480,000 | 3,200 | 324 |

**Standouts**: Wijnanda (4,756 hrs, 213 EUR/ton), Radar (3,850 hrs, 321 EUR/ton), and Corma B (3,200 hrs, 324 EUR/ton) combine very low engine hours with competitive pricing.

### Engine Revision Interaction

**Limitation**: The extracted CSV does not contain raw_details, so we cannot test whether recently revised engines reduce the price impact of high engine hours. This would require parsing engine revision dates from the raw vessel data.

---

## 4. Market Segmentation

**Charts**: `analysis/charts/elbow_plot.png`, `analysis/charts/market_segments.png`, `analysis/charts/market_segments_length_price.png`

### Method

- Features: length_m, tonnage, build_year, price (StandardScaler normalized)
- K-Means clustering, k=3 to k=8 tested
- Elbow method suggested k=3, but k=5 was used for more actionable granularity
- Sample size: n=350 (after dropping rows with NaN in segmentation features)

### Segment Profiles

| Segment | Count | Avg Price | Avg Length | Avg Tonnage | Avg Age | Avg Engine Hours | Dominant Type |
|---------|-------|-----------|-----------|-------------|---------|-----------------|--------------|
| **Premium Large Cargo** | 39 | 4,146,282 | 124.4m | 3,511t | 19 yrs | 43,626 | Motorvrachtschip (51%) |
| **Mid-Range Heavy Haulers** | 85 | 2,030,635 | 100.9m | 2,441t | 34 yrs | 43,780 | Motorvrachtschip (60%) |
| **Established Workhorses** | 129 | 688,244 | 80.4m | 1,294t | 61 yrs | 29,881 | Motorvrachtschip (77%) |
| **Value Segment** | 30 | 405,617 | 71.1m | 1,097t | 97 yrs | 30,701 | Motorvrachtschip (77%) |
| **Budget River Classics** | 67 | 208,231 | 47.3m | 498t | 64 yrs | 26,102 | Motorvrachtschip (49%) |

### Interpretation

1. **Premium Large Cargo** (39 vessels, avg 4.1M EUR): Modern, large vessels (124m avg, 19 yrs avg age). These are the newest and largest fleet segment, typically post-2000 builds.

2. **Mid-Range Heavy Haulers** (85 vessels, avg 2.0M EUR): Slightly smaller (101m avg) and older (34 yrs) than premium. The workhorse segment of the mid-market.

3. **Established Workhorses** (129 vessels, avg 688K EUR): The largest segment. Classic 80m vessels from the 1960s. These are the backbone of the inland fleet -- aging but still operational.

4. **Value Segment** (30 vessels, avg 406K EUR): Very old vessels (avg 97 years!) at moderate lengths. These are pre-war/early postwar vessels that still operate.

5. **Budget River Classics** (67 vessels, avg 208K EUR): Smaller vessels (47m avg) at entry-level prices. Diverse types -- only 49% Motorvrachtschip. Good entry point for new operators or conversion projects.

---

## 5. Broker Pricing Comparison

**Chart**: `analysis/charts/broker_pricing.png`

### Multi-Broker Listings

37 vessels found listed on multiple brokers (via canonical_vessel_id). Key finding: **most multi-listed vessels have identical prices across brokers**. Examples:
- Gibraltar: 5,450,000 on Galle, GTS Schepen, and PC Shipbrokers
- Johannes: 4,995,000 on Galle and PC Shipbrokers
- RS Alinda: 269,000 on GTS Schepen and PC Shipbrokers

The few exceptions:
- **Mi Vida**: 1,995,000 (PC Shipbrokers) vs 1,985,000 (GTS Schepen) -- 10K difference
- **Drakar**: 550,000 (PC Shipbrokers) vs 675,000 (GSK) -- 125K difference (23% gap)
- **Flottant**: 695,000 (PC Shipbrokers) vs 700,000 (GTS Schepen) -- 5K difference

**Conclusion**: Brokers generally list at identical prices, suggesting sellers set the price and all listing brokers reflect it. Systematic broker-level markup is not observed.

### Overall Broker Price Distribution

| Broker | Median Price | Mean Price | Count |
|--------|-------------|-----------|-------|
| Galle | 4,075,000 | 3,823,333 | 9 |
| Rensen Driessen | 3,162,500 | 3,481,964 | 56 |
| PC Shipbrokers | 720,000 | 1,198,792 | 120 |
| GSK | 650,000 | 977,643 | 115 |
| GTS Schepen | 325,000 | 526,261 | 88 |

**Important caveat**: These differences reflect **portfolio composition**, not pricing strategy. Galle and Rensen Driessen specialize in premium/large vessels, while GTS Schepen focuses on smaller/budget vessels. After controlling for vessel characteristics, brokers do not systematically price differently.

---

## 6. Deal Score Formula

### Simple Linear Model

**Sample size**: n=331

```
expected_price = 8,716.98 * length_m + 471.23 * tonnage + 23,135.59 * build_year + (-45,859,670.99)
```

| Metric | Value |
|--------|-------|
| R² (train) | 0.741 |
| R² (5-fold CV) | 0.727 +/- 0.046 |
| Mean Absolute Error | 452,725 EUR |
| Median Absolute Error | 281,808 EUR |

### Coefficient Interpretation

- Each additional **meter of length** adds ~8,717 EUR to expected price
- Each additional **ton of capacity** adds ~471 EUR
- Each additional **year of build year** (i.e., 1 year newer) adds ~23,136 EUR
- The intercept is large and negative because build_year values are ~1930-2020

### Known Limitation

The linear model produces negative expected prices for very old, small vessels (pre-1950 builds under 50m). This is inherent to linear extrapolation. For production use, the formula should include a `Math.max(0, ...)` floor.

### TypeScript Implementation

```typescript
function expectedPrice(length_m: number, tonnage: number, build_year: number): number {
  return Math.max(0, 8716.98 * length_m + 471.23 * tonnage + 23135.59 * build_year + (-45859670.99));
}

function dealScore(actual_price: number, length_m: number, tonnage: number, build_year: number): number {
  const expected = expectedPrice(length_m, tonnage, build_year);
  if (expected <= 0) return 0; // Cannot score vessels outside model range
  return Math.round(((expected - actual_price) / expected) * 100);
  // Positive = underpriced (good deal), Negative = overpriced
}
```

### Comparison to Percentile Method

The linear model reclassifies **71 vessels (21.5%)** compared to a within-type percentile approach. Specifically, these vessels are scored as >20% below expected price by the regression but fall in the 30th-70th percentile within their type. This means the regression identifies cross-type value that percentile ranking misses.

**Recommendation**: Use the regression-based deal score as primary, with the within-type percentile as a secondary indicator. The regression captures size-age interactions that simple percentile ranking cannot.

---

## 7. Price Metrics by Type

**Chart**: `analysis/charts/price_metrics_by_type.png`

### Which Metric is More Meaningful?

Measured by coefficient of variation (CV) -- lower = more consistent within-type pricing metric:

| Type | CV (per_ton) | CV (per_meter) | Better Metric |
|------|-------------|---------------|--------------|
| Motorvrachtschip | 0.52 | 0.80 | **price_per_ton** |
| Tankschip | 0.44 | 0.79 | **price_per_ton** |
| Beunschip | 0.48 | 0.56 | **price_per_ton** |
| Duw/Sleepboot | 0.50 | 0.91 | **price_per_ton** |
| Duwbak | 0.63 | 0.61 | **price_per_meter** |
| Koppelverband | 0.62 | 0.60 | **price_per_meter** |

### Interpretation

- **For cargo vessels** (Motorvrachtschip, Tankschip, Beunschip): **price-per-ton is the better metric**. This makes sense -- cargo capacity is the primary economic value driver for freight vessels.
- **For non-cargo vessels** (Duwbak, Koppelverband): **price-per-meter is slightly better**. These vessels derive value from push/pull capability and deck space rather than cargo tonnage.
- **Duw/Sleepboot** (push/tug boats): price_per_ton is technically more consistent (0.50 vs 0.91), but many tugs lack tonnage data. Price_per_meter may be more practical due to better data availability.

**Recommendation**: Default to price_per_ton for cargo types, price_per_meter for push/tug/barge types. Display both in the frontend but highlight the primary metric per type.

---

## 8. Time-on-Market Analysis

**Chart**: `analysis/charts/time_on_market.png`

### Data Limitation

Days-on-market has limited variation in this snapshot: most vessels show 122 days (the dataset window). Only 18 unique values exist, clustering around the maximum. This suggests the `days_on_market` is calculated from `first_seen_at` relative to a fixed reference date, and most vessels were already listed when scraping started.

### What We Can Observe

| Type | Median Days | Mean Days | Count |
|------|------------|----------|-------|
| Tankschip | 76 | 70 | 32 |
| Beunschip | 122 | 120 | 23 |
| Duw/Sleepboot | 122 | 112 | 20 |
| Duwbak | 122 | 107 | 17 |
| Koppelverband | 122 | 100 | 11 |
| Motorvrachtschip | 122 | 109 | 207 |

### Key Finding

**Tankschip sell fastest** (median 76 days vs 122 for others). This likely reflects strong demand for tanker vessels in the inland shipping market, possibly driven by chemical/petroleum transport demand.

### Price-Duration Correlation

Correlation between days_on_market and price: **-0.254**. Higher-priced vessels tend to have fewer days on market, but this is weak and likely confounded by: (a) recently listed vessels being more likely to be premium, and (b) the limited time range of the dataset.

**Recommendation**: Track time-on-market over multiple scraping cycles to get meaningful duration data. The current snapshot is too uniform for robust analysis.

---

## Summary of Key Findings

1. **Price is driven by three factors**: build year (44%), length (31%), and tonnage (17%). Together they explain 83% of price variance.
2. **Engine hours barely matter** -- only 1.3% of model importance, and ~7,100 EUR per 10,000 hours after controlling for size/age.
3. **The market has 5 clear segments**, from Premium Large Cargo (avg 4.1M) to Budget River Classics (avg 208K).
4. **Brokers don't systematically over/underprice** -- multi-listed vessels nearly always have identical prices across brokers.
5. **A simple 3-variable linear formula** (length + tonnage + build_year) achieves R²=0.73 and is implementable in the frontend.
6. **Price-per-ton is the best comparison metric** for cargo vessels; price-per-meter for barges/tugs.
7. **Tankschip sell fastest** (median 76 days), suggesting strong market demand.
8. **48 "sweet spot" vessels** identified with below-median engine hours AND below-median price-per-ton for their type.
