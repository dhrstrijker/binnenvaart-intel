"""
Model 1: Baseline Linear Regression (3 features)

Reproduces the exact coefficients from vesselPricing.ts.
Per-type linear regression: length_m, tonnage, build_year.
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from base_model import BaseModel

FEATURES = ["length_m", "tonnage", "build_year"]
MIN_TYPE_SAMPLES = 10


class BaselineLinear(BaseModel):

    @property
    def name(self) -> str:
        return "Baseline Linear (3 feat)"

    def __init__(self):
        self.models = {}  # type -> LinearRegression
        self.fallback = None

    def _prepare(self, X):
        """Extract features, fill missing tonnage with 0."""
        df = X[FEATURES].copy()
        df["tonnage"] = df["tonnage"].fillna(0)
        return df

    def fit(self, X_train, y_train):
        self.models = {}
        self.fallback = None

        df = self._prepare(X_train)
        types = X_train["type"].fillna("Unknown")

        # Per-type models for types with enough samples
        for t, group in df.groupby(types):
            if len(group) < MIN_TYPE_SAMPLES:
                continue
            mask = group.index
            y_sub = y_train.loc[mask]
            # Skip if any target is NaN
            valid = y_sub.notna() & df.loc[mask].notna().all(axis=1)
            if valid.sum() < MIN_TYPE_SAMPLES:
                continue
            lr = LinearRegression()
            lr.fit(df.loc[mask][valid], y_sub[valid])
            self.models[t] = lr

        # Fallback model on all data
        valid = df.notna().all(axis=1) & y_train.notna()
        if valid.sum() > 0:
            self.fallback = LinearRegression()
            self.fallback.fit(df[valid], y_train[valid])

    def predict(self, X) -> np.ndarray:
        df = self._prepare(X)
        types = X["type"].fillna("Unknown")
        preds = np.full(len(X), np.nan)

        for i in range(len(X)):
            row = df.iloc[[i]]
            if pd.isna(row["length_m"].iloc[0]) or pd.isna(row["build_year"].iloc[0]):
                continue
            row = row.fillna(0)

            t = types.iloc[i]
            model = self.models.get(t, self.fallback)
            if model is not None:
                pred = model.predict(row)[0]
                preds[i] = max(10_000, min(15_000_000, pred))

        return preds

    def describe(self) -> dict:
        return {
            "approach": "Per-type OLS linear regression with 3 features (length, tonnage, build_year). "
                        "Reproduces current vesselPricing.ts coefficients.",
            "features_used": FEATURES,
            "n_parameters": len(self.models) * 4 + 4,  # 3 coeff + intercept per type + fallback
            "per_type_models": list(self.models.keys()),
        }

    def export_for_frontend(self) -> dict | None:
        """Export coefficients matching vesselPricing.ts format."""
        result = {}
        for type_name, model in self.models.items():
            coefs = model.coef_
            result[type_name] = {
                "length": round(coefs[0], 2),
                "tonnage": round(coefs[1], 2),
                "build_year": round(coefs[2], 2),
                "intercept": round(model.intercept_, 2),
                "r2": 0,  # Will be filled from evaluation
                "label": type_name,
            }

        if self.fallback:
            coefs = self.fallback.coef_
            result["_fallback"] = {
                "length": round(coefs[0], 2),
                "tonnage": round(coefs[1], 2),
                "build_year": round(coefs[2], 2),
                "intercept": round(self.fallback.intercept_, 2),
                "r2": 0,
                "label": "Alle typen",
            }

        return result
