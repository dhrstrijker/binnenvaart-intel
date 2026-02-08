"""
Model 5: LLM-Augmented Ridge Regression

Ridge regression combining standard engineered features with LLM-extracted
condition/renovation/certificate features from extract_llm_features.py.

Gracefully degrades to base features only when llm_features.csv is absent.
"""
from __future__ import annotations

import os
import logging

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import GridSearchCV

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from base_model import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature definitions
# ---------------------------------------------------------------------------
BASE_FEATURES = [
    "length_m",
    "width_m",
    "tonnage",
    "build_year",
    "engine_power_hp",
    "engine_hours",
    "vessel_age",
]

LLM_FEATURES = [
    "condition_score",
    "recent_renovation",  # bool -> int
    "certificate_quality",
]

# Required features: if both are missing, prediction is impossible
REQUIRED_FEATURES = ["length_m", "build_year"]

# Ridge alpha grid for CV tuning
ALPHAS = [0.1, 1, 10, 100]
CV_FOLDS = 3

# Prediction clipping bounds
PRICE_MIN = 10_000
PRICE_MAX = 15_000_000

# Path to LLM features CSV
LLM_FEATURES_CSV = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "llm_features.csv",
)


class LLMAugmentedRidge(BaseModel):
    """Ridge regression with optional LLM-extracted features."""

    @property
    def name(self) -> str:
        return "LLM-Augmented Ridge"

    def __init__(self):
        self.model = None
        self.feature_cols = []
        self.medians = {}
        self.llm_available = False
        self.llm_features_df = None
        self.best_alpha = None

    # ------------------------------------------------------------------
    # LLM feature loading
    # ------------------------------------------------------------------
    def _load_llm_features(self) -> pd.DataFrame | None:
        """Attempt to load llm_features.csv; return None if unavailable."""
        if not os.path.exists(LLM_FEATURES_CSV):
            logger.info(
                "LLM features CSV not found at %s; falling back to base features.",
                LLM_FEATURES_CSV,
            )
            return None

        try:
            df = pd.read_csv(LLM_FEATURES_CSV)
            if "id" not in df.columns:
                logger.warning("LLM features CSV has no 'id' column; ignoring.")
                return None
            # Convert recent_renovation to int
            if "recent_renovation" in df.columns:
                df["recent_renovation"] = df["recent_renovation"].astype(int)
            logger.info("Loaded LLM features for %d vessels.", len(df))
            return df
        except Exception as e:
            logger.warning("Failed to load LLM features: %s", e)
            return None

    # ------------------------------------------------------------------
    # Feature engineering
    # ------------------------------------------------------------------
    def _merge_llm(self, X: pd.DataFrame) -> pd.DataFrame:
        """Left-join LLM features onto X using 'id' column."""
        if self.llm_features_df is None or "id" not in X.columns:
            return X

        merged = X.merge(
            self.llm_features_df[["id"] + LLM_FEATURES],
            on="id",
            how="left",
        )
        return merged

    def _prepare(self, X: pd.DataFrame, fitting: bool = False) -> pd.DataFrame:
        """
        Build the feature matrix.

        During fitting:
            - Merge LLM features
            - Compute medians for imputation
            - Create indicator columns for missing values
        During prediction:
            - Apply stored medians
        """
        df = self._merge_llm(X)

        # Determine active feature set
        active = list(BASE_FEATURES)
        if self.llm_available:
            active += LLM_FEATURES

        # Select only active features that exist
        present = [c for c in active if c in df.columns]
        result = df[present].copy()

        if fitting:
            # Compute medians for imputation (only on training data)
            self.medians = {}
            for col in present:
                med = result[col].median()
                self.medians[col] = med if pd.notna(med) else 0

        # Add missing-indicator columns + median imputation
        indicator_cols = []
        for col in present:
            missing_mask = result[col].isna()
            if missing_mask.any() or (not fitting):
                indicator_col = f"{col}_missing"
                result[indicator_col] = missing_mask.astype(int)
                indicator_cols.append(indicator_col)
            result[col] = result[col].fillna(self.medians.get(col, 0))

        if fitting:
            self.feature_cols = present + indicator_cols

        # Ensure all expected columns exist during prediction
        for col in self.feature_cols:
            if col not in result.columns:
                result[col] = 0

        return result[self.feature_cols]

    def _cannot_predict_mask(self, X: pd.DataFrame) -> np.ndarray:
        """Boolean mask: True for rows where prediction is not possible."""
        mask = np.zeros(len(X), dtype=bool)
        for feat in REQUIRED_FEATURES:
            if feat in X.columns:
                mask |= X[feat].isna().values
            else:
                mask[:] = True
        return mask

    # ------------------------------------------------------------------
    # BaseModel interface
    # ------------------------------------------------------------------
    def fit(self, X_train, y_train):
        # Reset state
        self.model = None
        self.feature_cols = []
        self.medians = {}
        self.best_alpha = None

        # Load LLM features
        self.llm_features_df = self._load_llm_features()
        self.llm_available = self.llm_features_df is not None

        # If LLM features loaded, check that at least some vessels match
        if self.llm_available and "id" in X_train.columns:
            matched = X_train["id"].isin(self.llm_features_df["id"]).sum()
            if matched == 0:
                logger.info("No LLM feature matches found; falling back to base features.")
                self.llm_available = False
                self.llm_features_df = None

        # Prepare features
        Xf = self._prepare(X_train, fitting=True)

        # Filter out rows that cannot be predicted + NaN targets
        cannot = self._cannot_predict_mask(X_train)
        valid = ~cannot & y_train.notna().values
        if valid.sum() == 0:
            logger.error("No valid training samples.")
            return

        Xf_valid = Xf.loc[valid].values
        y_valid = y_train.loc[valid].values

        # GridSearchCV for alpha selection
        ridge = Ridge()
        grid = GridSearchCV(
            ridge,
            param_grid={"alpha": ALPHAS},
            cv=CV_FOLDS,
            scoring="r2",
        )
        grid.fit(Xf_valid, y_valid)

        self.model = grid.best_estimator_
        self.best_alpha = grid.best_params_["alpha"]

    def predict(self, X) -> np.ndarray:
        preds = np.full(len(X), np.nan)

        if self.model is None:
            return preds

        cannot = self._cannot_predict_mask(X)
        predictable = ~cannot

        if predictable.sum() == 0:
            return preds

        Xf = self._prepare(X, fitting=False)
        raw_preds = self.model.predict(Xf.loc[predictable].values)

        # Clip to valid range
        raw_preds = np.clip(raw_preds, PRICE_MIN, PRICE_MAX)
        preds[predictable] = raw_preds

        return preds

    def describe(self) -> dict:
        features_used = list(BASE_FEATURES)
        if self.llm_available:
            features_used += LLM_FEATURES

        n_params = len(self.feature_cols) + 1 if self.model else 0  # coefficients + intercept

        approach = (
            "Ridge regression with median imputation and missing-value indicators. "
            "Base features: length, width, tonnage, build_year, engine_power, "
            "engine_hours, vessel_age."
        )
        if self.llm_available:
            approach += (
                " Augmented with LLM-extracted features: condition_score, "
                "recent_renovation, certificate_quality."
            )
        else:
            approach += " LLM features unavailable; using base features only."

        if self.best_alpha is not None:
            approach += f" Best alpha={self.best_alpha} (3-fold GridSearchCV)."

        return {
            "approach": approach,
            "features_used": features_used,
            "n_parameters": n_params,
            "llm_features_available": self.llm_available,
            "best_alpha": self.best_alpha,
        }

    def export_for_frontend(self) -> dict | None:
        return None
