"""
Model 4: Log-Price GBM

GradientBoostingRegressor that predicts log(price) instead of price directly.
Addresses the 240x price range (59K-14.3M) and right skew by working in
log space, then back-transforms with Duan's smearing correction.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import GridSearchCV

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from base_model import BaseModel

# ---------------------------------------------------------------------------
# Feature definitions (same as tree ensemble)
# ---------------------------------------------------------------------------
NUMERIC_FEATURES = [
    "length_m", "width_m", "tonnage", "build_year", "engine_hours",
    "engine_power_hp", "generator_kva", "bow_thruster_hp", "fuel_tank_liters",
    "num_holds", "clearance_height_m", "cargo_capacity_m3", "vessel_age",
]

BOOLEAN_FEATURES = ["double_hull", "has_bow_thruster", "certificate_valid"]

CATEGORICAL_FEATURES = {
    "hull_type": None,       # one-hot all values
    "type": 10,              # one-hot top N types only
}

MIN_PRICE = 10_000
MAX_PRICE = 15_000_000


class LogPriceGBM(BaseModel):

    @property
    def name(self) -> str:
        return "Log-Price GBM"

    def __init__(self):
        self.model_ = None
        self.medians_ = {}            # median per numeric column (imputation)
        self.onehot_columns_ = {}     # col -> list of categories kept
        self.feature_names_ = []      # final feature column order
        self.sigma2_ = 0.0            # variance of log residuals (Duan's smearing)
        self.best_params_ = {}

    # ------------------------------------------------------------------
    # Feature engineering helpers
    # ------------------------------------------------------------------

    def _build_features(self, X: pd.DataFrame, *, fitting: bool = False) -> pd.DataFrame:
        """Select, impute, and encode features.  Returns a clean numeric DataFrame."""
        parts = []

        # --- Numeric features ---
        for col in NUMERIC_FEATURES:
            series = X[col].astype(float) if col in X.columns else pd.Series(np.nan, index=X.index)

            if fitting:
                self.medians_[col] = float(series.median()) if series.notna().any() else 0.0

            median_val = self.medians_.get(col, 0.0)

            # Binary missing indicator
            missing_flag = series.isna().astype(float)
            missing_flag.name = f"{col}_missing"

            filled = series.fillna(median_val)
            filled.name = col

            parts.append(filled)
            parts.append(missing_flag)

        # --- Boolean features ---
        for col in BOOLEAN_FEATURES:
            if col in X.columns:
                series = X[col].astype(float).fillna(0.0)
            else:
                series = pd.Series(0.0, index=X.index)
            series.name = col
            parts.append(series)

        # --- Categorical features (one-hot) ---
        for col, top_n in CATEGORICAL_FEATURES.items():
            raw = X[col].fillna("Unknown").astype(str) if col in X.columns else pd.Series("Unknown", index=X.index)

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

        df = pd.concat(parts, axis=1)

        if fitting:
            self.feature_names_ = list(df.columns)
        else:
            # Ensure same columns in same order; add missing cols as 0
            for c in self.feature_names_:
                if c not in df.columns:
                    df[c] = 0.0
            df = df[self.feature_names_]

        return df

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

        # Only keep rows where length_m is present and y is valid
        has_length = X_train["length_m"].notna()
        valid_y = y_train.notna() & (y_train > 0)
        mask = has_length & valid_y

        X_fit = X_train.loc[mask].reset_index(drop=True)
        y_fit = y_train.loc[mask].reset_index(drop=True)

        if len(y_fit) < 5:
            return

        # Build feature matrix
        feat = self._build_features(X_fit, fitting=True)

        # Transform target to log space
        log_y = np.log(y_fit.values)

        # Grid search in log space
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
            base_gbm,
            param_grid,
            cv=3,
            scoring="r2",
            n_jobs=-1,
            refit=True,
        )
        grid.fit(feat.values, log_y)

        self.model_ = grid.best_estimator_
        self.best_params_ = grid.best_params_

        # Compute Duan's smearing correction: sigma^2 of log residuals
        log_preds_train = self.model_.predict(feat.values)
        log_residuals = log_y - log_preds_train
        self.sigma2_ = float(np.var(log_residuals))

    def predict(self, X) -> np.ndarray:
        preds = np.full(len(X), np.nan)

        if self.model_ is None:
            return preds

        # Rows with length_m present get predictions
        has_length = X["length_m"].notna()
        if has_length.sum() == 0:
            return preds

        X_valid = X.loc[has_length].reset_index(drop=True)
        feat = self._build_features(X_valid, fitting=False)

        log_pred = self.model_.predict(feat.values)

        # Back-transform with Duan's smearing / bias correction
        # E[price] = exp(log_pred + 0.5 * sigma^2)
        raw_pred = np.exp(log_pred + 0.5 * self.sigma2_)

        # Clip to valid range
        raw_pred = np.clip(raw_pred, MIN_PRICE, MAX_PRICE)

        preds[has_length.values] = raw_pred
        return preds

    def describe(self) -> dict:
        n_trees = self.model_.n_estimators if self.model_ is not None else 0
        max_leaves = 2 ** 3  # max_depth=3
        approx_params = n_trees * max_leaves

        all_features = list(NUMERIC_FEATURES) + BOOLEAN_FEATURES
        for col, cats in self.onehot_columns_.items():
            all_features += [f"{col}_{c}" for c in cats]

        return {
            "approach": (
                "GradientBoostingRegressor trained on log(price). "
                "Back-transforms with Duan's smearing correction exp(pred + 0.5*sigma^2). "
                "Addresses 240x price range and right skew. "
                "Hyperparameters tuned via 3-fold GridSearchCV."
            ),
            "features_used": self.feature_names_,
            "n_parameters": approx_params,
            "best_params": self.best_params_,
            "sigma2": self.sigma2_,
            "numeric_features": NUMERIC_FEATURES,
            "boolean_features": BOOLEAN_FEATURES,
            "categorical_features": {k: v for k, v in CATEGORICAL_FEATURES.items()},
        }

    def export_for_frontend(self) -> dict | None:
        return None
