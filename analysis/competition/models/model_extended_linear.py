"""
Model 2: Extended Linear Regression (Ridge with GridSearchCV)

Ridge regression with 9 raw features + median imputation + imputation indicators.
Per-type sub-models for Motorvrachtschip and Tankschip (if >=10 samples),
with a pooled fallback for all other types combined.
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import GridSearchCV
from sklearn.preprocessing import OneHotEncoder

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from base_model import BaseModel

# Raw numeric features to use (before imputation indicators)
NUMERIC_FEATURES = [
    "length_m",
    "width_m",
    "tonnage",
    "build_year",
    "engine_power_hp",
    "engine_hours",
    "vessel_age",
    "clearance_height_m",
]

CATEGORICAL_FEATURE = "hull_type"

# Types that get their own dedicated sub-model
DEDICATED_TYPES = ["Motorvrachtschip", "Tankschip"]
MIN_TYPE_SAMPLES = 10

# Ridge alpha grid for GridSearchCV
ALPHAS = [0.01, 0.1, 1, 10, 100, 1000]
CV_FOLDS = 3

# Prediction clipping bounds
MIN_PRICE = 10_000
MAX_PRICE = 15_000_000


class ExtendedLinear(BaseModel):

    @property
    def name(self) -> str:
        return "Extended Linear (Ridge)"

    def __init__(self):
        self.models = {}          # type_key -> fitted Ridge
        self.best_alphas = {}     # type_key -> best alpha
        self.medians = {}         # type_key -> {feature: median_value}
        self.hull_encoder = None  # shared OneHotEncoder for hull_type
        self.hull_categories = [] # category names after encoding
        self._feature_names = []  # final feature names after encoding

    # ------------------------------------------------------------------
    # Feature engineering helpers
    # ------------------------------------------------------------------

    def _fit_hull_encoder(self, hull_series: pd.Series):
        """Fit a one-hot encoder on the hull_type column."""
        filled = hull_series.fillna("Unknown").values.reshape(-1, 1)
        enc = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
        enc.fit(filled)
        self.hull_encoder = enc
        self.hull_categories = [f"hull_{c}" for c in enc.categories_[0]]

    def _encode_hull(self, hull_series: pd.Series) -> pd.DataFrame:
        """Transform hull_type into one-hot columns."""
        filled = hull_series.fillna("Unknown").values.reshape(-1, 1)
        encoded = self.hull_encoder.transform(filled)
        return pd.DataFrame(encoded, columns=self.hull_categories, index=hull_series.index)

    def _compute_medians(self, df: pd.DataFrame, type_key: str):
        """Compute per-feature medians for a subset and store them."""
        medians = {}
        for feat in NUMERIC_FEATURES:
            col = df[feat]
            med = col.median()
            # If median is NaN (all missing), fall back to 0
            medians[feat] = med if pd.notna(med) else 0.0
        self.medians[type_key] = medians

    def _impute_and_flag(self, df: pd.DataFrame, type_key: str) -> pd.DataFrame:
        """
        For each numeric feature:
        - Create a binary 'was_imputed_{feat}' indicator (1 if originally NaN, else 0)
        - Fill NaN with the stored median for this type_key
        """
        result = pd.DataFrame(index=df.index)
        medians = self.medians[type_key]

        for feat in NUMERIC_FEATURES:
            is_missing = df[feat].isna().astype(float)
            result[f"was_imputed_{feat}"] = is_missing
            result[feat] = df[feat].fillna(medians[feat])

        return result

    def _build_features(self, X: pd.DataFrame, type_key: str) -> pd.DataFrame:
        """
        Build the full feature matrix for a given type_key:
        - Numeric features (imputed) + imputation indicators
        - One-hot encoded hull_type
        """
        numeric_df = self._impute_and_flag(X, type_key)
        hull_df = self._encode_hull(X[CATEGORICAL_FEATURE])
        features = pd.concat([numeric_df, hull_df], axis=1)
        return features

    def _get_feature_names(self) -> list:
        """Return the ordered list of feature names after encoding."""
        names = []
        for feat in NUMERIC_FEATURES:
            names.append(f"was_imputed_{feat}")
            names.append(feat)
        names.extend(self.hull_categories)
        return names

    # ------------------------------------------------------------------
    # Splitting helpers
    # ------------------------------------------------------------------

    def _split_by_type(self, X: pd.DataFrame, y: pd.Series):
        """
        Split data into dedicated type subsets and a pooled 'other' subset.

        Returns dict: type_key -> (X_subset, y_subset)
        """
        types = X["type"].fillna("Unknown")
        splits = {}

        for t in DEDICATED_TYPES:
            mask = types == t
            if mask.sum() >= MIN_TYPE_SAMPLES:
                splits[t] = (X.loc[mask].copy(), y.loc[mask].copy())

        # Pooled 'other': everything not in a dedicated split
        dedicated_mask = types.isin([t for t in splits])
        other_mask = ~dedicated_mask
        if other_mask.sum() > 0:
            splits["_other"] = (X.loc[other_mask].copy(), y.loc[other_mask].copy())

        return splits

    # ------------------------------------------------------------------
    # Core interface
    # ------------------------------------------------------------------

    def fit(self, X_train, y_train):
        self.models = {}
        self.best_alphas = {}
        self.medians = {}

        # Fit shared hull encoder on all training data
        self._fit_hull_encoder(X_train[CATEGORICAL_FEATURE])
        self._feature_names = self._get_feature_names()

        # Split by type
        splits = self._split_by_type(X_train, y_train)

        for type_key, (X_sub, y_sub) in splits.items():
            # Compute and store medians for this type
            self._compute_medians(X_sub, type_key)

            # Build feature matrix
            features = self._build_features(X_sub, type_key)

            # Remove rows where target is NaN or features have remaining NaN
            valid = y_sub.notna() & features.notna().all(axis=1)
            if valid.sum() < MIN_TYPE_SAMPLES:
                continue

            X_fit = features.loc[valid]
            y_fit = y_sub.loc[valid]

            # GridSearchCV to find best alpha
            ridge = Ridge()
            grid = GridSearchCV(
                ridge,
                param_grid={"alpha": ALPHAS},
                cv=min(CV_FOLDS, len(y_fit)),
                scoring="r2",
                n_jobs=-1,
            )
            grid.fit(X_fit, y_fit)

            self.models[type_key] = grid.best_estimator_
            self.best_alphas[type_key] = grid.best_params_["alpha"]

    def predict(self, X) -> np.ndarray:
        types = X["type"].fillna("Unknown")
        preds = np.full(len(X), np.nan)

        for i in range(len(X)):
            row_X = X.iloc[[i]]

            # Cannot predict if both length_m and build_year are missing
            if pd.isna(row_X["length_m"].iloc[0]) and pd.isna(row_X["build_year"].iloc[0]):
                continue

            t = types.iloc[i]

            # Determine which sub-model to use
            if t in self.models:
                type_key = t
            elif "_other" in self.models:
                type_key = "_other"
            else:
                # No model available at all
                continue

            # Ensure medians exist for this type_key
            if type_key not in self.medians:
                continue

            features = self._build_features(row_X, type_key)

            model = self.models[type_key]
            pred = model.predict(features)[0]
            preds[i] = max(MIN_PRICE, min(MAX_PRICE, pred))

        return preds

    def describe(self) -> dict:
        n_params = 0
        for model in self.models.values():
            # Ridge: n_features coefficients + 1 intercept
            n_params += len(model.coef_) + 1

        return {
            "approach": (
                "Per-type Ridge regression with GridSearchCV alpha tuning. "
                "9 raw features (length, width, tonnage, build_year, engine_power, "
                "engine_hours, vessel_age, clearance_height, hull_type one-hot) "
                "plus median imputation with was_imputed binary indicators. "
                "Dedicated sub-models for Motorvrachtschip and Tankschip, "
                "pooled fallback for all other types."
            ),
            "features_used": self._feature_names,
            "n_parameters": n_params,
            "per_type_models": list(self.models.keys()),
            "best_alphas": self.best_alphas,
        }

    def export_for_frontend(self) -> dict | None:
        """
        Export top-level linear coefficients (length, tonnage, build_year)
        matching the vesselPricing.ts Coefficients format.

        Ridge is still a linear model so we can extract the coefficients
        for the three core features used by the frontend. The extra features
        (width, engine_power, etc.) are folded into the intercept effectively
        by evaluating them at their median values.
        """
        if not self.models:
            return None

        result = {}

        # Map from our feature names to the index in the feature vector
        feat_names = self._feature_names

        def _get_idx(name):
            try:
                return feat_names.index(name)
            except ValueError:
                return None

        length_idx = _get_idx("length_m")
        tonnage_idx = _get_idx("tonnage")
        build_year_idx = _get_idx("build_year")

        if length_idx is None or tonnage_idx is None or build_year_idx is None:
            return None

        for type_key, model in self.models.items():
            coefs = model.coef_
            intercept = model.intercept_

            # Determine display label
            if type_key == "_other":
                label = "Alle typen"
                export_key = "_fallback"
            else:
                label = type_key
                export_key = type_key

            result[export_key] = {
                "length": round(float(coefs[length_idx]), 2),
                "tonnage": round(float(coefs[tonnage_idx]), 2),
                "build_year": round(float(coefs[build_year_idx]), 2),
                "intercept": round(float(intercept), 2),
                "r2": 0,  # Will be filled from evaluation
                "label": label,
            }

        return result
