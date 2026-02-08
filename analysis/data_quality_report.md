# Data Quality Report

Generated: 2026-02-08

## Summary

- **Total vessels**: 756
- **With price**: 497
- **Unique (non-duplicate)**: 577
- **Priced & deduplicated**: 391
- **Outliers flagged**: 3

## Field Coverage by Source

| Field | galle | gsk | gtsschepen | pcshipbrokers | rensendriessen | Total |
|---|---|---|---|---|---|---|
| price | 18/25 (72.0%) | 133/251 (53.0%) | 113/176 (64.2%) | 169/222 (76.1%) | 64/82 (78.0%) | 497/756 (65.7%) |
| length_m | 25/25 (100.0%) | 251/251 (100.0%) | 174/176 (98.9%) | 222/222 (100.0%) | 82/82 (100.0%) | 754/756 (99.7%) |
| width_m | 24/25 (96.0%) | 251/251 (100.0%) | 174/176 (98.9%) | 222/222 (100.0%) | 82/82 (100.0%) | 753/756 (99.6%) |
| tonnage | 25/25 (100.0%) | 230/251 (91.6%) | 163/176 (92.6%) | 215/222 (96.8%) | 51/82 (62.2%) | 684/756 (90.5%) |
| build_year | 24/25 (96.0%) | 250/251 (99.6%) | 171/176 (97.2%) | 222/222 (100.0%) | 58/82 (70.7%) | 725/756 (95.9%) |
| engine_hours | 0/25 (0.0%) | 107/251 (42.6%) | 85/176 (48.3%) | 115/222 (51.8%) | 38/82 (46.3%) | 345/756 (45.6%) |
| engine_power_hp | 0/25 (0.0%) | 163/251 (64.9%) | 130/176 (73.9%) | 122/222 (55.0%) | 43/82 (52.4%) | 458/756 (60.6%) |
| engine_make | 0/25 (0.0%) | 168/251 (66.9%) | 130/176 (73.9%) | 142/222 (64.0%) | 53/82 (64.6%) | 493/756 (65.2%) |
| generator_kva | 9/25 (36.0%) | 162/251 (64.5%) | 120/176 (68.2%) | 131/222 (59.0%) | 40/82 (48.8%) | 462/756 (61.1%) |
| bow_thruster_hp | 0/25 (0.0%) | 114/251 (45.4%) | 100/176 (56.8%) | 120/222 (54.1%) | 38/82 (46.3%) | 372/756 (49.2%) |
| fuel_tank_liters | 0/25 (0.0%) | 0/251 (0.0%) | 112/176 (63.6%) | 135/222 (60.8%) | 33/82 (40.2%) | 280/756 (37.0%) |
| num_holds | 15/25 (60.0%) | 136/251 (54.2%) | 117/176 (66.5%) | 0/222 (0.0%) | 0/82 (0.0%) | 268/756 (35.4%) |
| hull_type | 0/25 (0.0%) | 88/251 (35.1%) | 129/176 (73.3%) | 100/222 (45.0%) | 0/82 (0.0%) | 317/756 (41.9%) |
| clearance_height_m | 16/25 (64.0%) | 122/251 (48.6%) | 120/176 (68.2%) | 124/222 (55.9%) | 0/82 (0.0%) | 382/756 (50.5%) |
| cargo_capacity_m3 | 9/25 (36.0%) | 120/251 (47.8%) | 108/176 (61.4%) | 93/222 (41.9%) | 0/82 (0.0%) | 330/756 (43.7%) |
| double_hull | 0/25 (0.0%) | 55/251 (21.9%) | 92/176 (52.3%) | 16/222 (7.2%) | 0/82 (0.0%) | 163/756 (21.6%) |
| has_bow_thruster | 0/25 (0.0%) | 133/251 (53.0%) | 100/176 (56.8%) | 120/222 (54.1%) | 38/82 (46.3%) | 391/756 (51.7%) |
| engine_revision_year | 0/25 (0.0%) | 55/251 (21.9%) | 54/176 (30.7%) | 23/222 (10.4%) | 19/82 (23.2%) | 151/756 (20.0%) |
| certificate_valid | 0/25 (0.0%) | 136/251 (54.2%) | 135/176 (76.7%) | 152/222 (68.5%) | 42/82 (51.2%) | 465/756 (61.5%) |

## Data Anomalies

### Missing Build Year (31 vessels)
- . (rensendriessen)
- ARESE (rensendriessen)
- SONORA (rensendriessen)
- KAMALIJ (rensendriessen)
- VERPUS (rensendriessen)
- Edel turquoise (gsk)
- DUDARO (rensendriessen)
- STADT KÖLN (rensendriessen)
- SERANO (rensendriessen)
- THREANT (rensendriessen)
- CHRIDA (rensendriessen)
- Te koop: Goedlopend rondvaartbedrijf in Midden-Nederland (gtsschepen)
- ALAIN D (rensendriessen)
- VIOS (rensendriessen)
- Amigos (galle)
- CALENDULA 7 (rensendriessen)
- Eemsteyn III (gtsschepen)
- VIKING KARVE (rensendriessen)
- STILLE VERKOOP (gtsschepen)
- RIPOSA (rensendriessen)
- ... and 11 more

### Short Vessels (length < 10m): 0

### Wide Vessels (width > 25m): 0

## Engine Hours Extraction

- **Successfully parsed**: 345
- **Parse failures**: 1

| Source | Parsed | Total | Rate |
|---|---|---|---|
| galle | 0 | 25 | 0.0% |
| gsk | 107 | 251 | 42.6% |
| gtsschepen | 85 | 176 | 48.3% |
| pcshipbrokers | 115 | 222 | 51.8% |
| rensendriessen | 38 | 82 | 46.3% |

### Parse Failures (first 20)
- gtsschepen | Hendi W | raw: Onbekend

## Price Outliers (z-score > 3 on price/ton by type)

**3 outliers detected**

| Name | Source | Type | Price | Tonnage | Price/Ton |
|---|---|---|---|---|---|
| Wendy | pcshipbrokers | Motorvrachtschip | 3,650,000 | 1750.0 | 2,086 |
| Pelagus | rensendriessen | Motorvrachtschip | 3,850,000 | 2505.0 | 1,537 |
| Porthos | pcshipbrokers | Motorvrachtschip | 2,400,000 | 1500.0 | 1,600 |

## Cross-Source Price Comparison

Vessels listed by multiple brokers (via canonical_vessel_id) with >20% price difference:

| Vessel | Source 1 | Price 1 | Source 2 | Price 2 | Ratio |
|---|---|---|---|---|---|
| Bremare | pcshipbrokers | 290,000 | gtsschepen | 175,000 | 1.66x |
| Sympharosa | gsk | 1,100,000 | gtsschepen | 750,000 | 1.47x |
| Risico | gsk | 475,000 | pcshipbrokers | 325,000 | 1.46x |
| Micanto | gtsschepen | 450,000 | galle | 630,000 | 1.40x |
| Mojo | gtsschepen | 159,000 | gsk | 120,000 | 1.32x |
| Drakar | gsk | 675,000 | pcshipbrokers | 550,000 | 1.23x |

## Summary Statistics (Priced & Deduplicated)

| Metric | Count | Mean | Median | Min | Max | Std |
|---|---|---|---|---|---|---|
| price | 391 | 1,385,920.7 | 699,000.0 | 50,000.0 | 14,300,000.0 | 1,665,867.6 |
| length_m | 391 | 81.0 | 80.2 | 10.8 | 190.0 | 29.4 |
| width_m | 391 | 9.0 | 9.2 | 3.7 | 17.6 | 2.2 |
| tonnage | 357 | 1,652.4 | 1,361.0 | 10.0 | 5,985.0 | 1,054.6 |
| build_year | 377 | 1,972.8 | 1,968.0 | 1,907.0 | 2,025.0 | 23.6 |
| engine_hours | 202 | 33,402.4 | 29,364.0 | 250.0 | 122,950.0 | 23,906.1 |
| engine_power_hp | 268 | 851.1 | 750.0 | 100.0 | 2,778.0 | 463.7 |
| vessel_age | 377 | 53.2 | 58.0 | 1.0 | 119.0 | 23.6 |
| days_on_market | 391 | 105.2 | 122.0 | 1.0 | 122.0 | 36.3 |
| price_per_meter | 391 | 14,774.9 | 10,165.9 | 1,201.4 | 105,925.9 | 13,855.8 |
| price_per_ton | 357 | 964.5 | 579.8 | 104.6 | 21,875.0 | 2,163.3 |