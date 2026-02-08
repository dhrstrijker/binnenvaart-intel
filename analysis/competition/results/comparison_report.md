# Model Competition Results

Generated: 2026-02-08 16:25

## Overall Ranking (Holdout Set)

| Rank | Model | R² | RMSE | MAE | MAPE | Coverage | Overfit Gap | Flag |
|------|-------|-----|------|-----|------|----------|-------------|------|
| 1 | Log-Price GBM | 0.744 | 1,056,112 | 455,003 | 31.3% | 100.0% | 0.056 |  |
| 2 | Log-Price GBM + LLM | 0.727 | 1,090,614 | 449,476 | 28.5% | 100.0% | 0.063 |  |
| 3 | Extended Linear (Ridge) | 0.709 | 1,126,487 | 604,960 | 59.7% | 100.0% | 0.137 | NEG-Beunschi |
| 4 | GBM Ensemble | 0.667 | 1,205,795 | 503,225 | 38.3% | 100.0% | 0.111 |  |
| 5 | LLM-Augmented Ridge | 0.460 | 1,506,529 | 646,978 | 59.2% | 97.4% | 0.024 |  |
| 6 | Baseline Linear (3 feat) | 0.435 | 1,542,015 | 560,557 | 49.8% | 97.4% | 0.050 | NEG-Tankschi |

## Per-Type R² (Holdout)

| Model | Beunschip | Motorvrachtschip | Tankschip |
|------|------|------|------|
| Log-Price GBM | 0.726 | 0.837 | 0.625 |
| Log-Price GBM + LLM | 0.737 | 0.837 | 0.595 |
| Extended Linear (Ridge) | -0.208 | 0.800 | 0.648 |
| GBM Ensemble | 0.914 | 0.856 | 0.444 |
| LLM-Augmented Ridge | 0.748 | 0.810 | 0.075 |
| Baseline Linear (3 feat) | 0.898 | 0.802 | -0.093 |

## Cross-Validation Details

| Model | CV R² | CV R² Std | Train R² | Overfit Gap |
|-------|--------|-----------|----------|-------------|
| Baseline Linear (3 feat) | 0.838 | 0.018 | 0.888 | 0.050 |
| Extended Linear (Ridge) | 0.699 | 0.107 | 0.836 | 0.137 |
| Log-Price GBM + LLM | 0.802 | 0.076 | 0.865 | 0.063 |
| LLM-Augmented Ridge | 0.769 | 0.047 | 0.793 | 0.024 |
| Log-Price GBM | 0.802 | 0.088 | 0.858 | 0.056 |
| GBM Ensemble | 0.822 | 0.057 | 0.932 | 0.111 |

## Winner Declaration

- **Extended Linear (Ridge)**: DISQUALIFIED (negative R² on Beunschip)
- **Baseline Linear (3 feat)**: DISQUALIFIED (negative R² on Tankschip)

**WINNER: Log-Price GBM** (Holdout R² = 0.744)

## Model Descriptions

### Baseline Linear (3 feat)

- **Approach**: Per-type OLS linear regression with 3 features (length, tonnage, build_year). Reproduces current vesselPricing.ts coefficients.
- **Features**: length_m, tonnage, build_year
- **Parameters**: 32

### Extended Linear (Ridge)

- **Approach**: Per-type Ridge regression with GridSearchCV alpha tuning. 9 raw features (length, width, tonnage, build_year, engine_power, engine_hours, vessel_age, clearance_height, hull_type one-hot) plus median imputation with was_imputed binary indicators. Dedicated sub-models for Motorvrachtschip and Tankschip, pooled fallback for all other types.
- **Features**: was_imputed_length_m, length_m, was_imputed_width_m, width_m, was_imputed_tonnage, tonnage, was_imputed_build_year, build_year, was_imputed_engine_power_hp, engine_power_hp, was_imputed_engine_hours, engine_hours, was_imputed_vessel_age, vessel_age, was_imputed_clearance_height_m, clearance_height_m, hull_Unknown, hull_mixed, hull_riveted, hull_welded
- **Parameters**: 63

### Log-Price GBM + LLM

- **Approach**: GradientBoostingRegressor trained on log(price) with Duan's smearing correction. Same architecture as Log-Price GBM but augmented with LLM-extracted features (condition_score, recent_renovation, certificate_quality). Hyperparameters tuned via 3-fold GridSearchCV. LLM features active.
- **Features**: length_m, length_m_missing, width_m, width_m_missing, tonnage, tonnage_missing, build_year, build_year_missing, engine_hours, engine_hours_missing, engine_power_hp, engine_power_hp_missing, generator_kva, generator_kva_missing, bow_thruster_hp, bow_thruster_hp_missing, fuel_tank_liters, fuel_tank_liters_missing, num_holds, num_holds_missing, clearance_height_m, clearance_height_m_missing, cargo_capacity_m3, cargo_capacity_m3_missing, vessel_age, vessel_age_missing, condition_score, condition_score_missing, recent_renovation, recent_renovation_missing, certificate_quality, certificate_quality_missing, double_hull, has_bow_thruster, certificate_valid, hull_type_Unknown, hull_type_welded, hull_type_riveted, hull_type_mixed, type_Motorvrachtschip, type_Tankschip, type_Beunschip, type_Duw/Sleepboot, type_Unknown, type_Duwbak, type_Koppelverband, type_Overige, type_Woonschip, type_Ponton
- **Parameters**: 800

### LLM-Augmented Ridge

- **Approach**: Ridge regression with median imputation and missing-value indicators. Base features: length, width, tonnage, build_year, engine_power, engine_hours, vessel_age. Augmented with LLM-extracted features: condition_score, recent_renovation, certificate_quality. Best alpha=100 (3-fold GridSearchCV).
- **Features**: length_m, width_m, tonnage, build_year, engine_power_hp, engine_hours, vessel_age, condition_score, recent_renovation, certificate_quality
- **Parameters**: 19

### Log-Price GBM

- **Approach**: GradientBoostingRegressor trained on log(price). Back-transforms with Duan's smearing correction exp(pred + 0.5*sigma^2). Addresses 240x price range and right skew. Hyperparameters tuned via 3-fold GridSearchCV.
- **Features**: length_m, length_m_missing, width_m, width_m_missing, tonnage, tonnage_missing, build_year, build_year_missing, engine_hours, engine_hours_missing, engine_power_hp, engine_power_hp_missing, generator_kva, generator_kva_missing, bow_thruster_hp, bow_thruster_hp_missing, fuel_tank_liters, fuel_tank_liters_missing, num_holds, num_holds_missing, clearance_height_m, clearance_height_m_missing, cargo_capacity_m3, cargo_capacity_m3_missing, vessel_age, vessel_age_missing, double_hull, has_bow_thruster, certificate_valid, hull_type_Unknown, hull_type_welded, hull_type_riveted, hull_type_mixed, type_Motorvrachtschip, type_Tankschip, type_Beunschip, type_Duw/Sleepboot, type_Unknown, type_Duwbak, type_Koppelverband, type_Overige, type_Woonschip, type_Ponton
- **Parameters**: 800

### GBM Ensemble

- **Approach**: Gradient Boosting Regressor with conservative settings (max_depth=3, min_samples_leaf=10, subsample=0.8). Uses all numeric features + boolean flags + one-hot hull_type and type + interaction features (length*tonnage, vessel_age*type). Hyperparameters tuned via 3-fold GridSearchCV. Automatic overfitting guard: reduces max_depth to 2 if train-CV R2 gap > 0.15.
- **Features**: length_m, width_m, tonnage, build_year, engine_hours, engine_power_hp, generator_kva, bow_thruster_hp, fuel_tank_liters, num_holds, clearance_height_m, cargo_capacity_m3, vessel_age, length_m_imputed, width_m_imputed, tonnage_imputed, build_year_imputed, engine_hours_imputed, engine_power_hp_imputed, generator_kva_imputed, bow_thruster_hp_imputed, fuel_tank_liters_imputed, num_holds_imputed, clearance_height_m_imputed, cargo_capacity_m3_imputed, vessel_age_imputed, double_hull, has_bow_thruster, certificate_valid, hull_Unknown, hull_mixed, hull_riveted, hull_welded, type_Beunschip, type_Duw/Sleepboot, type_Duwbak, type_Koppelverband, type_Motorvrachtschip, type_Other, type_Tankschip, type_Unknown, length_x_tonnage, age_x_type_Beunschip, age_x_type_Duw/Sleepboot, age_x_type_Duwbak, age_x_type_Koppelverband, age_x_type_Motorvrachtschip, age_x_type_Other, age_x_type_Tankschip, age_x_type_Unknown
- **Parameters**: 800
