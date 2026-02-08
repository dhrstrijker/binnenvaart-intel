"""
Model 6: Log-Price GBM + LLM Features

Combines the winning Log-Price GBM architecture (log-space prediction with
Duan's smearing correction) with LLM-extracted condition/renovation/certificate
features. Gracefully degrades to standard features if llm_features.csv is absent.
"""
from __future__ import annotations

import logging
import os
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import GridSearchCV

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from base_model import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature definitions
# ---------------------------------------------------------------------------
NUMERIC_FEATURES = [
    "length_m", "width_m", "tonnage", "build_year", "engine_hours",
    "engine_power_hp", "generator_kva", "bow_thruster_hp", "fuel_tank_liters",
    "num_holds", "clearance_height_m", "cargo_capacity_m3", "vessel_age",
]

BOOLEAN_FEATURES = ["double_hull", "has_bow_thruster", "certificate_valid"]

CATEGORICAL_FEATURES = {
    "hull_type": None,
    "type": 10,
}

LLM_FEATURES = ["condition_score", "recent_renovation", "certificate_quality"]

LLM_FEATURES_CSV = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "llm_features.csv",
)

MIN_PRICE = 10_000
MAX_PRICE = 15_000_000


class GBMLLMHybrid(BaseModel):

    @property
    def name(self) -> str:
        return "Log-Price GBM + LLM"

    def __init__(self):
        self.model_ = None
        self.medians_ = {}
        self.onehot_columns_ = {}
        self.feature_names_ = []
        self.sigma2_ = 0.0
        self.best_params_ = {}
        self.llm_available = False
        self.llm_features_df = None

    # ------------------------------------------------------------------
    # LLM feature loading
    # ------------------------------------------------------------------
    def _load_llm_features(self) -> pd.DataFrame | None:
        if not os.path.exists(LLM_FEATURES_CSV):
            logger.info("LLM features CSV not found; using standard features only.")
            return None
        try:
            df = pd.read_csv(LLM_FEATURES_CSV)
            if "id" not in df.columns:
                logger.warning("LLM features CSV has no 'id' column; ignoring.")
                return None
            if "recent_renovation" in df.columns:
                df["recent_renovation"] = df["recent_renovation"].map(
                    {True: 1, False: 0, "True": 1, "False": 0}
                ).fillna(0).astype(float)
            logger.info("Loaded LLM features for %d vessels.", len(df))
            return df
        except Exception as e:
            logger.warning("Failed to load LLM features: %s", e)
            return None

    def _merge_llm(self, X: pd.DataFrame) -> pd.DataFrame:
        if self.llm_features_df is None or "id" not in X.columns:
            return X
        return X.merge(
            self.llm_features_df[["id"] + LLM_FEATURES],
            on="id",
            how="left",
        )

    # ------------------------------------------------------------------
    # Feature engineering
    # ------------------------------------------------------------------
    def _build_features(self, X: pd.DataFrame, *, fitting: bool = False) -> pd.DataFrame:
        df = self._merge_llm(X)
        parts = []

        # --- Numeric features ---
        for col in NUMERIC_FEATURES:
            series = df[col].astype(float) if col in df.columns else pd.Series(np.nan, index=df.index)
            if fitting:
                self.medians_[col] = float(series.median()) if series.notna().any() else 0.0
            median_val = self.medians_.get(col, 0.0)
            missing_flag = series.isna().astype(float)
            missing_flag.name = f"{col}_missing"
            filled = series.fillna(median_val)
            filled.name = col
            parts.append(filled)
            parts.append(missing_flag)

        # --- LLM features (treated as numeric with imputation) ---
        if self.llm_available:
            for col in LLM_FEATURES:
                series = df[col].astype(float) if col in df.columns else pd.Series(np.nan, index=df.index)
                if fitting:
                    self.medians_[col] = float(series.median()) if series.notna().any() else 0.0
                median_val = self.medians_.get(col, 0.0)
                missing_flag = series.isna().astype(float)
                missing_flag.name = f"{col}_missing"
                filled = series.fillna(median_val)
                filled.name = col
                parts.append(filled)
                parts.append(missing_flag)

        # --- Boolean features ---
        for col in BOOLEAN_FEATURES:
            if col in df.columns:
                series = df[col].astype(float).fillna(0.0)
            else:
                series = pd.Series(0.0, index=df.index)
            series.name = col
            parts.append(series)

        # --- Categorical features (one-hot) ---
        for col, top_n in CATEGORICAL_FEATURES.items():
            raw = df[col].fillna("Unknown").astype(str) if col in df.columns else pd.Series("Unknown", index=df.index)
            if fitting:
                if top_n is not None:
                    top_cats = raw.value_counts().head(top_n).index.tolist()
                else:
                    top_cats = raw.value_counts().index.tolist()
                self.onehot_columns_[col] = top_cats
            categories = self.onehot_columns_.get(col, [])
            for cat in categories:
                indicator = (raw == cat).astype(float)
                indicator.name = f"{col}_{cat}"
                parts.append(indicator)

        result = pd.concat(parts, axis=1)

        if fitting:
            self.feature_names_ = list(result.columns)
        else:
            for c in self.feature_names_:
                if c not in result.columns:
                    result[c] = 0.0
            result = result[self.feature_names_]

        return result

    # ------------------------------------------------------------------
    # BaseModel interface
    # ------------------------------------------------------------------
    def fit(self, X_train, y_train):
        self.model_ = None
        self.medians_ = {}
        self.onehot_columns_ = {}
        self.feature_names_ = []
        self.sigma2_ = 0.0
        self.best_params_ = {}

        # Load LLM features
        self.llm_features_df = self._load_llm_features()
        self.llm_available = self.llm_features_df is not None

        # Check for actual matches
        if self.llm_available and "id" in X_train.columns:
            matched = X_train["id"].isin(self.llm_features_df["id"]).sum()
            if matched < 10:
                logger.info("Only %d LLM feature matches; falling back to standard features.", matched)
                self.llm_available = False
                self.llm_features_df = None
            else:
                logger.info("Matched LLM features for %d/%d training vessels.", matched, len(X_train))

        # Filter to valid rows
        has_length = X_train["length_m"].notna()
        valid_y = y_train.notna() & (y_train > 0)
        mask = has_length & valid_y

        X_fit = X_train.loc[mask].reset_index(drop=True)
        y_fit = y_train.loc[mask].reset_index(drop=True)

        if len(y_fit) < 5:
            return

        feat = self._build_features(X_fit, fitting=True)
        log_y = np.log(y_fit.values)

        # Grid search
        base_gbm = GradientBoostingRegressor(
            max_depth=3,
            min_samples_leaf=10,
            subsample=0.8,
            random_state=42,
        )
        param_grid = {
            "n_estimators": [100, 200, 300],
            "learning_rate": [0.03, 0.05, 0.1],
        }
        grid = GridSearchCV(
            base_gbm, param_grid, cv=3, scoring="r2", n_jobs=-1, refit=True,
        )
        grid.fit(feat.values, log_y)

        self.model_ = grid.best_estimator_
        self.best_params_ = grid.best_params_

        # Duan's smearing correction
        log_preds_train = self.model_.predict(feat.values)
        log_residuals = log_y - log_preds_train
        self.sigma2_ = float(np.var(log_residuals))

    def predict(self, X) -> np.ndarray:
        preds = np.full(len(X), np.nan)
        if self.model_ is None:
            return preds

        has_length = X["length_m"].notna()
        if has_length.sum() == 0:
            return preds

        X_valid = X.loc[has_length].reset_index(drop=True)
        feat = self._build_features(X_valid, fitting=False)

        log_pred = self.model_.predict(feat.values)
        raw_pred = np.exp(log_pred + 0.5 * self.sigma2_)
        raw_pred = np.clip(raw_pred, MIN_PRICE, MAX_PRICE)

        preds[has_length.values] = raw_pred
        return preds

    def describe(self) -> dict:
        n_trees = self.model_.n_estimators if self.model_ is not None else 0
        approx_params = n_trees * (2 ** 3)

        return {
            "approach": (
                "GradientBoostingRegressor trained on log(price) with Duan's smearing "
                "correction. Same architecture as Log-Price GBM but augmented with "
                "LLM-extracted features (condition_score, recent_renovation, "
                "certificate_quality). Hyperparameters tuned via 3-fold GridSearchCV."
                + (" LLM features active." if self.llm_available
                   else " LLM features unavailable; equivalent to standard Log-Price GBM.")
            ),
            "features_used": self.feature_names_,
            "n_parameters": approx_params,
            "best_params": self.best_params_,
            "sigma2": self.sigma2_,
            "llm_features_available": self.llm_available,
        }

    def export_for_frontend(self) -> dict | None:
        return None
