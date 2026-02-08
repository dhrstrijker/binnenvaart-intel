"""
Deterministic data loading and splitting for the model competition.

Provides a single source of truth for train/test split so all models
are evaluated on the exact same data.
"""

import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold

DATA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(DATA_DIR, "extracted_data_priced.csv")

# Outlier IDs removed (z-score > 3 on price_per_ton)
RANDOM_STATE = 42
TEST_SIZE = 0.20
MIN_TYPE_SAMPLES_FOR_STRATIFY = 5


def load_data() -> pd.DataFrame:
    """Load priced vessel data and remove flagged outliers."""
    df = pd.read_csv(CSV_PATH)
    df = df[df["is_outlier"] == False].copy()
    df = df[df["price"].notna() & (df["price"] > 0)].copy()
    df = df.reset_index(drop=True)
    return df


def _stratify_column(df: pd.DataFrame) -> pd.Series:
    """
    Create stratification column: use vessel type, but group
    rare types (< MIN_TYPE_SAMPLES_FOR_STRATIFY) into 'Other'.
    """
    type_counts = df["type"].value_counts()
    rare_types = type_counts[type_counts < MIN_TYPE_SAMPLES_FOR_STRATIFY].index
    strat = df["type"].fillna("Unknown").copy()
    strat[strat.isin(rare_types)] = "Other"
    return strat


def get_train_test():
    """
    Load data and return deterministic stratified 80/20 split.

    Returns
    -------
    X_train, X_test, y_train, y_test : DataFrames / Series
        X contains all feature columns (models pick what they need).
        y is the price column.
    """
    df = load_data()
    strat = _stratify_column(df)
    y = df["price"]
    X = df.drop(columns=["price"])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=strat
    )

    return (
        X_train.reset_index(drop=True),
        X_test.reset_index(drop=True),
        y_train.reset_index(drop=True),
        y_test.reset_index(drop=True),
    )


def get_cv_folds(X, y, n_splits=5):
    """
    Return 5-fold stratified CV indices.

    Parameters
    ----------
    X : pd.DataFrame
        Training features (must include 'type' column).
    y : pd.Series
        Training target.
    n_splits : int
        Number of CV folds.

    Yields
    ------
    train_idx, val_idx : np.ndarray
        Index arrays for each fold.
    """
    type_counts = X["type"].value_counts()
    rare_types = type_counts[type_counts < MIN_TYPE_SAMPLES_FOR_STRATIFY].index
    strat = X["type"].fillna("Unknown").copy()
    strat[strat.isin(rare_types)] = "Other"

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_STATE)
    for train_idx, val_idx in skf.split(X, strat):
        yield train_idx, val_idx


if __name__ == "__main__":
    df = load_data()
    print(f"Total priced vessels (no outliers): {len(df)}")
    print(f"\nType distribution:")
    print(df["type"].value_counts().to_string())

    X_train, X_test, y_train, y_test = get_train_test()
    print(f"\nTrain: {len(X_train)}, Test: {len(X_test)}")
    print(f"Train types:\n{X_train['type'].value_counts().to_string()}")
    print(f"Test types:\n{X_test['type'].value_counts().to_string()}")
