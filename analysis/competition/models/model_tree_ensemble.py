"""
Model 3: GBM Ensemble (Gradient Boosting with feature engineering)

GradientBoostingRegressor with conservative hyperparameters, grid-searched
learning rate and n_estimators, interaction features, and automatic
overfitting detection with depth reduction.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import GridSearchCV, cross_val_score
from sklearn.impute import SimpleImputer

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from base_model import BaseModel

# ---------------------------------------------------------------------------
# Feature configuration
# ---------------------------------------------------------------------------

NUMERIC_FEATURES = [
    "length_m", "width_m", "tonnage", "build_year", "engine_hours",
    "engine_power_hp", "generator_kva", "bow_thruster_hp", "fuel_tank_liters",
    "num_holds", "clearance_height_m", "cargo_capacity_m3", "vessel_age",
]

BOOLEAN_FEATURES = ["double_hull", "has_bow_thruster", "certificate_valid"]

CATEGORICAL_FEATURES_ONEHOT = ["hull_type"]  # full one-hot
TYPE_COLUMN = "type"                          # one-hot, top types only

TOP_TYPE_MIN_COUNT = 10  # types with fewer samples get grouped as "Other"

PRICE_FLOOR = 10_000
PRICE_CEILING = 15_000_000
OVERFIT_GAP_THRESHOLD = 0.15


class TreeEnsemble(BaseModel):

    @property
    def name(self) -> str:
        return "GBM Ensemble"

    def __init__(self):
        self.model = None
        self.feature_names_ = []
        self.imputer_ = None
        self.imputed_indicators_ = []
        self.type_top_categories_ = []
        self.hull_type_categories_ = []
        self.numeric_medians_ = {}
        self.best_params_ = {}
        self.train_r2_ = None
        self.cv_r2_ = None
        self.was_refit_ = False

    # ------------------------------------------------------------------
    # Feature engineering helpers
    # ------------------------------------------------------------------

    def _build_feature_matrix(self, X: pd.DataFrame, *, fit: bool = False) -> pd.DataFrame:
        """
        Transform raw DataFrame into the feature matrix used by GBM.

        When ``fit=True`` the transformer learns categories / medians.
        """
        parts = []

        # --- Numeric features with median imputation + indicators ----------
        num_df = X[NUMERIC_FEATURES].copy().apply(pd.to_numeric, errors="coerce")

        if fit:
            self.numeric_medians_ = num_df.median()

        imputed_indicators = pd.DataFrame(index=X.index)
        for col in NUMERIC_FEATURES:
            mask = num_df[col].isna()
            imputed_indicators[f"{col}_imputed"] = mask.astype(np.float64)
            num_df[col] = num_df[col].fillna(self.numeric_medians_.get(col, 0))

        parts.append(num_df)
        parts.append(imputed_indicators)

        # --- Boolean features ----------------------------------------------
        bool_df = pd.DataFrame(index=X.index)
        for col in BOOLEAN_FEATURES:
            if col in X.columns:
                bool_df[col] = X[col].apply(
                    lambda v: 1.0 if v is True or v == 1 or v == "True" or v == "true"
                    else (0.0 if v is False or v == 0 or v == "False" or v == "false"
                          else np.nan)
                )
                median_val = bool_df[col].median()
                bool_df[col] = bool_df[col].fillna(median_val if not np.isnan(median_val) else 0.0)
            else:
                bool_df[col] = 0.0
        parts.append(bool_df)

        # --- hull_type one-hot ---------------------------------------------
        hull_raw = X["hull_type"].fillna("Unknown").astype(str) if "hull_type" in X.columns else pd.Series("Unknown", index=X.index)
        if fit:
            self.hull_type_categories_ = sorted(hull_raw.unique().tolist())
        for cat in self.hull_type_categories_:
            parts.append(pd.DataFrame({f"hull_{cat}": (hull_raw == cat).astype(np.float64)}, index=X.index))

        # --- type one-hot (top types, rare -> Other) -----------------------
        type_raw = X[TYPE_COLUMN].fillna("Unknown").astype(str)
        if fit:
            counts = type_raw.value_counts()
            self.type_top_categories_ = sorted(counts[counts >= TOP_TYPE_MIN_COUNT].index.tolist())

        type_mapped = type_raw.where(type_raw.isin(self.type_top_categories_), other="Other")
        all_type_cats = sorted(self.type_top_categories_ + ["Other"])
        type_ohe = pd.DataFrame(index=X.index)
        for cat in all_type_cats:
            type_ohe[f"type_{cat}"] = (type_mapped == cat).astype(np.float64)
        parts.append(type_ohe)

        # --- Interaction features ------------------------------------------
        interactions = pd.DataFrame(index=X.index)

        # length_m * tonnage
        interactions["length_x_tonnage"] = num_df["length_m"] * num_df["tonnage"]

        # vessel_age * each type one-hot column
        for cat in all_type_cats:
            interactions[f"age_x_type_{cat}"] = num_df["vessel_age"] * type_ohe[f"type_{cat}"]

        parts.append(interactions)

        # --- Assemble ------------------------------------------------------
        result = pd.concat(parts, axis=1)

        if fit:
            self.feature_names_ = result.columns.tolist()
        else:
            # Ensure same columns in same order; add missing as 0, drop extra
            for col in self.feature_names_:
                if col not in result.columns:
                    result[col] = 0.0
            result = result[self.feature_names_]

        return result.astype(np.float64)

    # ------------------------------------------------------------------
    # BaseModel interface
    # ------------------------------------------------------------------

    def fit(self, X_train, y_train):
        # Build feature matrix (learns medians / categories)
        Xf = self._build_feature_matrix(X_train, fit=True)

        # Mask: require length_m present and valid target
        length_present = X_train["length_m"].notna() if "length_m" in X_train.columns else pd.Series(True, index=X_train.index)
        valid = length_present & y_train.notna() & np.isfinite(Xf).all(axis=1)
        Xf_valid = Xf.loc[valid]
        y_valid = y_train.loc[valid]

        if len(Xf_valid) < 20:
            # Not enough data - store a dummy
            self.model = None
            return

        # --- Grid search (3-fold CV) --------------------------------------
        param_grid = {
            "n_estimators": [100, 200, 300],
            "learning_rate": [0.03, 0.05, 0.1],
        }

        base_gbm = GradientBoostingRegressor(
            max_depth=3,
            min_samples_leaf=10,
            subsample=0.8,
            random_state=42,
        )

        gs = GridSearchCV(
            base_gbm,
            param_grid,
            cv=3,
            scoring="r2",
            n_jobs=-1,
            refit=True,
        )
        gs.fit(Xf_valid, y_valid)

        self.model = gs.best_estimator_
        self.best_params_ = gs.best_params_

        # --- Overfitting check: train R2 vs CV R2 -------------------------
        self.train_r2_ = self.model.score(Xf_valid, y_valid)
        cv_scores = cross_val_score(self.model, Xf_valid, y_valid, cv=3, scoring="r2")
        self.cv_r2_ = float(np.mean(cv_scores))
        self.was_refit_ = False

        gap = self.train_r2_ - self.cv_r2_
        if gap > OVERFIT_GAP_THRESHOLD:
            # Refit with reduced depth
            reduced_gbm = GradientBoostingRegressor(
                max_depth=2,
                min_samples_leaf=10,
                subsample=0.8,
                n_estimators=self.best_params_["n_estimators"],
                learning_rate=self.best_params_["learning_rate"],
                random_state=42,
            )
            reduced_gbm.fit(Xf_valid, y_valid)
            self.model = reduced_gbm
            self.was_refit_ = True

            # Recompute metrics after refit
            self.train_r2_ = self.model.score(Xf_valid, y_valid)
            cv_scores = cross_val_score(self.model, Xf_valid, y_valid, cv=3, scoring="r2")
            self.cv_r2_ = float(np.mean(cv_scores))

    def predict(self, X) -> np.ndarray:
        preds = np.full(len(X), np.nan)

        if self.model is None:
            return preds

        Xf = self._build_feature_matrix(X, fit=False)

        # Rows where length_m is present
        length_present = X["length_m"].notna() if "length_m" in X.columns else pd.Series(True, index=X.index)
        predictable = length_present & np.isfinite(Xf).all(axis=1)

        if predictable.any():
            raw = self.model.predict(Xf.loc[predictable])
            clipped = np.clip(raw, PRICE_FLOOR, PRICE_CEILING)
            preds[predictable.values] = clipped

        return preds

    def describe(self) -> dict:
        n_params = 0
        if self.model is not None:
            # Each tree has roughly 2^depth leaf nodes; total params ~ n_estimators * leaves
            depth = self.model.max_depth or 3
            n_params = self.model.n_estimators * (2 ** depth)

        return {
            "approach": (
                "Gradient Boosting Regressor with conservative settings "
                "(max_depth=3, min_samples_leaf=10, subsample=0.8). "
                "Uses all numeric features + boolean flags + one-hot hull_type and type + "
                "interaction features (length*tonnage, vessel_age*type). "
                "Hyperparameters tuned via 3-fold GridSearchCV. "
                "Automatic overfitting guard: reduces max_depth to 2 if train-CV R2 gap > 0.15."
            ),
            "features_used": self.feature_names_,
            "n_features": len(self.feature_names_),
            "n_parameters": n_params,
            "best_params": self.best_params_,
            "train_r2": self.train_r2_,
            "cv_r2": self.cv_r2_,
            "was_refit_for_overfitting": self.was_refit_,
        }

    def export_for_frontend(self) -> dict | None:
        # Tree models cannot be exported as linear coefficients
        return None
