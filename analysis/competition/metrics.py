"""
Evaluation metrics for the model competition.

All metrics handle NaN predictions gracefully (excluded from calculation).
"""

import numpy as np
import pandas as pd
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error


def _filter_valid(y_true, y_pred):
    """Remove rows where prediction is NaN."""
    mask = ~np.isnan(y_pred) & ~np.isnan(y_true)
    return np.array(y_true)[mask], np.array(y_pred)[mask]


def r2(y_true, y_pred) -> float:
    yt, yp = _filter_valid(y_true, y_pred)
    if len(yt) < 2:
        return float("nan")
    return r2_score(yt, yp)


def rmse(y_true, y_pred) -> float:
    yt, yp = _filter_valid(y_true, y_pred)
    if len(yt) == 0:
        return float("nan")
    return float(np.sqrt(mean_squared_error(yt, yp)))


def mae(y_true, y_pred) -> float:
    yt, yp = _filter_valid(y_true, y_pred)
    if len(yt) == 0:
        return float("nan")
    return float(mean_absolute_error(yt, yp))


def mape(y_true, y_pred, cap=200.0) -> float:
    """Mean Absolute Percentage Error, capped at `cap`% per row."""
    yt, yp = _filter_valid(y_true, y_pred)
    if len(yt) == 0:
        return float("nan")
    pct_errors = np.abs((yt - yp) / yt) * 100
    pct_errors = np.minimum(pct_errors, cap)
    return float(np.mean(pct_errors))


def coverage(y_pred) -> float:
    """Fraction of non-NaN predictions."""
    y = np.array(y_pred, dtype=float)
    return float(np.sum(~np.isnan(y)) / len(y)) if len(y) > 0 else 0.0


def per_type_r2(y_true, y_pred, types, min_samples=5) -> dict:
    """
    Compute R² per vessel type.

    Parameters
    ----------
    y_true, y_pred : array-like
    types : array-like of type strings
    min_samples : int
        Minimum samples to compute R² for a type.

    Returns
    -------
    dict : {type_name: r2_value}
    """
    result = {}
    types = np.array([str(t) if t is not None and t == t else "Unknown" for t in types])
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)

    for t in np.unique(types):
        mask = types == t
        yt = y_true[mask]
        yp = y_pred[mask]
        # Also filter NaN predictions
        valid = ~np.isnan(yp) & ~np.isnan(yt)
        if valid.sum() >= min_samples:
            result[t] = float(r2_score(yt[valid], yp[valid]))

    return result


def overfitting_score(train_r2: float, cv_r2: float) -> float:
    """
    Compute overfitting gap: train_R² - cv_R².
    Values > 0.15 indicate overfitting.
    """
    return train_r2 - cv_r2


def compute_all_metrics(y_true, y_pred, types=None) -> dict:
    """Compute all standard metrics in one call."""
    result = {
        "r2": r2(y_true, y_pred),
        "rmse": rmse(y_true, y_pred),
        "mae": mae(y_true, y_pred),
        "mape": mape(y_true, y_pred),
        "coverage": coverage(y_pred),
    }
    if types is not None:
        result["per_type_r2"] = per_type_r2(y_true, y_pred, types)
    return result


def learning_curve_scores(model_class, X, y, fractions=(0.2, 0.4, 0.6, 0.8, 1.0),
                          cv_folds_fn=None):
    """
    Compute CV R² at different training set sizes.

    Parameters
    ----------
    model_class : class
        Model class to instantiate (must have fit/predict).
    X, y : training data
    fractions : tuple of floats
        Fractions of training data to use.
    cv_folds_fn : callable
        Function that yields (train_idx, val_idx) folds.

    Returns
    -------
    dict : {fraction: {'mean_cv_r2': float, 'std_cv_r2': float}}
    """
    from .dataset import get_cv_folds

    results = {}
    X = pd.DataFrame(X).reset_index(drop=True)
    y = pd.Series(y).reset_index(drop=True)

    for frac in fractions:
        fold_scores = []
        folds_fn = cv_folds_fn or (lambda: get_cv_folds(X, y))

        for train_idx, val_idx in folds_fn():
            # Sub-sample the training fold
            n_use = max(5, int(len(train_idx) * frac))
            rng = np.random.RandomState(42)
            sub_idx = rng.choice(train_idx, size=n_use, replace=False)

            model = model_class()
            try:
                model.fit(X.iloc[sub_idx], y.iloc[sub_idx])
                preds = model.predict(X.iloc[val_idx])
                score = r2(y.iloc[val_idx], preds)
                if not np.isnan(score):
                    fold_scores.append(score)
            except Exception:
                pass

        if fold_scores:
            results[frac] = {
                "mean_cv_r2": float(np.mean(fold_scores)),
                "std_cv_r2": float(np.std(fold_scores)),
            }

    return results
