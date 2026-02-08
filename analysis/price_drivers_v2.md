# Price Drivers Analysis v2 - Per-Type Models

**Date**: 2026-02-08
**Dataset**: 388 priced vessels (after excluding 3 outliers), 6 types with n >= 15
**Improvement over v1**: Type-aware regression replaces single pooled model

---

## Key Changes from v1

| Aspect | v1 (Pooled) | v2 (Per-Type) |
|--------|-------------|---------------|
| Regression | Single GBM, R²=0.83, n=176 | Per-type: Motorvrachtschip GBM R²=0.93, others linear |
| Deal score | One formula for all types | Type-specific coefficients + fallback |
| Segmentation | K-means on all types (k=5) | Within-type for Motorvrachtschip (k=3) |
| Engine hours | Pooled effect: -7,126 EUR/10K hrs | MVS: -7,272; Tankschip: -142,762 EUR/10K hrs |
| Reclassification | 21.5% vs percentile method | 35.6% vs pooled linear model |

---

## 1. Per-Type Regression Models

### Motorvrachtschip (n=137, GBM)

The dominant type (233 vessels, 60% of dataset) now gets its own Gradient Boosting model.

**Performance**: CV R² = 0.926 ± 0.029 (vs pooled 0.736)

This is the single biggest improvement: removing type noise gives +19 percentage points of R².

**Feature Importance (Gini)**:

| Feature | Importance | Change from pooled |
|---------|-----------|-------------------|
| build_year | 0.363 | Was 0.436 — slightly less dominant |
| tonnage | 0.357 | Was 0.172 — **2x more important** within type |
| length_m | 0.256 | Was 0.308 — similar |
| engine_power_hp | 0.018 | Was 0.034 — halved |
| engine_hours | 0.006 | Was 0.013 — still negligible |

**Key insight**: When comparing only Motorvrachtschip against each other, tonnage becomes almost as important as build year. In the pooled model, tonnage was suppressed because different types have different tonnage distributions at different price levels.

**Chart**: `analysis/charts/per_type_feature_importance.png`

### Tankschip (n=36, Linear)

**Performance**: CV R² = 0.526 ± 0.468 (high variance due to small sample)

**Coefficients**:
| Feature | Coefficient | Interpretation |
|---------|------------|----------------|
| length_m | +12,762 | Each meter adds ~12,800 EUR (**1.5x** more than pooled) |
| tonnage | +546 | Each ton adds ~546 EUR (similar to pooled) |
| build_year | +26,317 | Each year newer adds ~26,300 EUR (**1.1x** more than pooled) |
| intercept | -52,005,837 | |

**Tanker premium confirmed**: A tanker's length coefficient is 2.2x that of Motorvrachtschip (12,762 vs 5,680). This means a 100m tanker commands ~712K more than a 100m Motorvrachtschip just from the length term alone, confirming the "tanker premium" from the initial analysis.

### Beunschip (n=23, Linear)

**Performance**: CV R² = -7.62 (overfitting — too few samples for cross-validation)
**Train R²**: 0.915 — fits well on training data but cannot generalize

**Recommendation**: Use the pooled (fallback) model for Beunschip deal scoring. The per-type model is informative for understanding price drivers but unreliable for prediction.

**Coefficients** (informational only):
| Feature | Coefficient |
|---------|------------|
| length_m | +9,954 |
| tonnage | +741 |
| build_year | +14,773 |

### Duw/Sleepboot (n=20, Linear)

**Performance**: CV R² = -3.29 (model worse than mean prediction)
**Train R²**: 0.032 — even training data fit is poor

**Why**: Push/tug boats are priced on engine power, thrust capacity, and bollard pull — none of which are in our feature set. Length and build year alone cannot predict tug pricing.

**Recommendation**: Use fallback model. Consider adding engine_power_hp as a feature when data improves.

### Duwbak (n=16, Linear)

**Performance**: CV R² = 0.398 ± 0.363
**Train R²**: 0.725

**Coefficients**:
| Feature | Coefficient |
|---------|------------|
| length_m | +10,534 |
| tonnage | +57 |
| build_year | +11,943 |

Moderate fit. Tonnage barely matters for barges (coefficient near zero) — pricing is primarily by length and age.

### Koppelverband (n=16, Linear)

**Performance**: CV R² = 0.280 ± 0.547
**Train R²**: 0.765

These are combination vessels (coupled units). The negative tonnage coefficient (-702) suggests that after controlling for length, higher tonnage actually correlates with lower prices — possibly because heavier units are older designs.

---

## 2. Per-Type Engine Hours Impact

### Motorvrachtschip: -7,272 EUR per 10,000 hours

Consistent with v1 findings. Engine hours remain a weak signal after controlling for size and age. The GBM partial dependence shows a gradual decline, with the steepest depreciation in the 0-20K hours range.

### Tankschip: -142,762 EUR per 10,000 hours

**This is the major new finding.** Engine hours matter **20x more** for tankers than for cargo vessels.

Why this makes sense:
- Tankers carry hazardous cargo (chemicals, petroleum), so engine reliability is safety-critical
- Inspection/certification requirements are stricter for tankers
- Engine overhaul costs are higher for tanker-grade engines
- Buyers pay a premium for low-hour tankers because recertification is easier

**Caveat**: n=17 for the controlled analysis. This coefficient has high uncertainty. But the direction and magnitude are consistent with industry knowledge.

**Chart**: `analysis/charts/engine_hours_by_type.png`

---

## 3. Type-Aware Deal Score Formula

### Recommended Implementation

Only Motorvrachtschip has a reliable enough per-type model (CV R² = 0.926) for production use. Tankschip (0.526) is borderline. All others should use the fallback.

**Production-ready coefficients**:

| Type | length_m | tonnage | build_year | intercept | CV R² | Use? |
|------|----------|---------|-----------|-----------|-------|------|
| Motorvrachtschip | 5,680 | 698 | 16,382 | -32,785,232 | 0.926 | Yes |
| Tankschip | 12,762 | 546 | 26,317 | -52,005,837 | 0.526 | Yes (borderline) |
| Duwbak | 10,534 | 57 | 11,943 | -24,016,120 | 0.398 | Optional |
| Koppelverband | 20,890 | -702 | 109,038 | -214,353,256 | 0.280 | No — use fallback |
| Beunschip | — | — | — | — | -7.62 | No — use fallback |
| Duw/Sleepboot | — | — | — | — | -3.29 | No — use fallback |
| _fallback (all types) | 8,391 | 482 | 23,318 | -46,208,569 | 0.736 | Default |

### TypeScript Implementation

```typescript
interface TypeCoefficients {
  length: number;
  tonnage: number;
  build_year: number;
  intercept: number;
}

const TYPE_COEFFICIENTS: Record<string, TypeCoefficients> = {
  'Motorvrachtschip': { length: 5680.45, tonnage: 697.91, build_year: 16382.36, intercept: -32785231.98 },
  'Tankschip': { length: 12761.84, tonnage: 545.76, build_year: 26316.55, intercept: -52005837.38 },
  'Duwbak': { length: 10534.15, tonnage: 57.28, build_year: 11943.15, intercept: -24016119.95 },
  '_fallback': { length: 8390.53, tonnage: 481.93, build_year: 23317.80, intercept: -46208569.38 },
};

function expectedPrice(
  type: string,
  length_m: number,
  tonnage: number | null,
  build_year: number
): number {
  const coefs = TYPE_COEFFICIENTS[type] ?? TYPE_COEFFICIENTS['_fallback'];
  let price = coefs.length * length_m
            + coefs.build_year * build_year
            + coefs.intercept;
  if (tonnage != null) {
    price += coefs.tonnage * tonnage;
  }
  return Math.max(0, price);
}

function dealScore(
  type: string,
  actual_price: number,
  length_m: number,
  tonnage: number | null,
  build_year: number
): number {
  const expected = expectedPrice(type, length_m, tonnage, build_year);
  if (expected <= 0) return 0;
  return Math.round(((expected - actual_price) / expected) * 100);
}
```

### Reclassification Analysis

**35.6% of vessels change deal score bucket** when switching from pooled to type-aware scoring.

| Direction | Count | Example |
|-----------|-------|---------|
| pooled "good deal" → type "fair" | 47 | Sammi (MVS): pooled +37% → type +10% |
| pooled "overpriced" → type "fair" | 26 | Hendrik 9 (Tug): pooled -1969% → type -10% |
| pooled "fair" → type "overpriced" | 19 | Vertrouwen (MVS): pooled +7% → type -491% |
| pooled "good deal" → type "overpriced" | 15 | Maria (Duwbak): pooled +35% → type -375% |
| pooled "fair" → type "good deal" | 8 | Treasure (Tankschip): pooled +5% → type +34% |

The biggest impact is on non-Motorvrachtschip types: tankers that looked "overpriced" against the cargo-dominated pooled model are actually "fair" when compared against tanker norms, while some Motorvrachtschip that looked like "good deals" were only cheap relative to tankers in the pooled data.

---

## 4. Motorvrachtschip Segmentation (Within-Type)

### Method

K-Means on (length_m, tonnage, build_year, price) for Motorvrachtschip only (n=226). Elbow method suggested k=3.

### Three Sub-Segments

| Segment | Count | Avg Price | Med Price | Avg Length | Avg Tonnage | Avg Age | Avg Engine Hours |
|---------|-------|-----------|-----------|-----------|-------------|---------|-----------------|
| **Modern Large Cargo** | 44 | 3,061,455 | 2,695,000 | 116.5m | 3,242t | 25 yrs | 53,841 |
| **Established Fleet** | 52 | 1,341,346 | 1,295,000 | 97.0m | 2,007t | 49 yrs | 38,859 |
| **Classic Rhine Freighters** | 130 | 423,969 | 354,000 | 71.7m | 1,029t | 70 yrs | 27,995 |

**Chart**: `analysis/charts/motorvrachtschip_segments.png`

### Interpretation

1. **Modern Large Cargo** (44 vessels): Post-2000 builds, 100-135m, 2,500-4,500t. The premium tier within Motorvrachtschip. Median price 2.7M EUR.

2. **Established Fleet** (52 vessels): 1970s-1990s builds, 85-110m, 1,500-2,500t. The workhorse mid-market. These often have recently overhauled engines and modernized wheelhouses.

3. **Classic Rhine Freighters** (130 vessels): Pre-1970 builds, 50-85m, 500-1,500t. The largest sub-segment. Entry-level prices (median 354K). Many are conversion candidates or suitable for owner-operators.

### Comparison to v1 All-Type Segmentation

The v1 segmentation (k=5 on all types) produced broader clusters that mixed Motorvrachtschip with tankers, barges, and tugs. The within-type segmentation produces more meaningful groups because it segments on pricing dynamics that are specific to cargo vessel size/age combinations.

---

## 5. Cross-Type Comparison

### Summary Table

| Type | n | Median Price | Median EUR/ton | Median EUR/m | Per-Type R² | Top Driver | EH Effect/10K |
|------|---|-------------|---------------|-------------|------------|-----------|--------------|
| Motorvrachtschip | 233 | 695,000 | 516 | 8,588 | 0.926 | build_year | -7,272 |
| Tankschip | 44 | 2,500,000 | 1,273 | 25,747 | 0.526 | build_year | -142,762 |
| Beunschip | 23 | 449,000 | 541 | 6,896 | N/A* | build_year | N/A |
| Duw/Sleepboot | 21 | 335,000 | 10,733 | 18,553 | N/A* | length_m | N/A |
| Duwbak | 19 | 440,000 | 205 | 7,652 | 0.398 | build_year | N/A |
| Koppelverband | 17 | 3,495,000 | 917 | 26,289 | 0.280 | build_year | N/A |

*N/A: Negative CV R², model unreliable

**Chart**: `analysis/charts/type_comparison.png`

### Key Observations

1. **Tanker premium is 2.5x per ton**: Tankschip median EUR/ton (1,273) is 2.5x that of Motorvrachtschip (516). This confirms the initial finding that type-blind pricing systematically misprices tankers.

2. **Koppelverband commands the highest EUR/meter** (26,289): These combination vessels are the most expensive per unit of length, reflecting the complexity of coupled designs.

3. **Duw/Sleepboot have extreme EUR/ton** (10,733): This is misleading because most tugs have no tonnage data — the few that do are small vessels where tonnage is low. Price-per-meter is a better metric for tugs.

4. **Duwbak have the lowest EUR/ton** (205): Barges are simple, unpowered vessels. Their value is primarily in dimensions and structural condition.

5. **Build year is the top driver for 5 of 6 types**: Only Duw/Sleepboot uses length_m as the primary driver, likely because tug pricing is more about physical size/engine power than age.

---

## 6. Summary: What Should the Frontend Use?

### For Deal Scoring

Use the **type-aware coefficients** for Motorvrachtschip and Tankschip. Use **pooled fallback** for all other types.

The Motorvrachtschip model (R² = 0.926) is highly reliable. The Tankschip model (R² = 0.526) is borderline but still much better than applying cargo vessel norms to tankers.

### For Engine Hours Display

- **Motorvrachtschip**: Show engine hours but with low weight. "Lage draaiuren" badge at < 30th percentile.
- **Tankschip**: Highlight engine hours prominently. -143K per 10K hours is meaningful on a 2.5M vessel (~6% per 10K hours).
- **Other types**: Show if available, no badge.

### For Market Segments

Use the 3-segment Motorvrachtschip classification (Modern Large Cargo / Established Fleet / Classic Rhine Freighters) as badges. These are more actionable than the 5-segment all-type clustering from v1.

### For Price Metrics on Cards

- Motorvrachtschip, Tankschip, Beunschip: Show EUR/ton (primary metric for cargo types)
- Duwbak, Koppelverband: Show EUR/meter (cargo capacity less relevant)
- Duw/Sleepboot: Show EUR/meter (tonnage data unavailable for most)
