#!/usr/bin/env python3
"""
Model Competition Harness

Auto-discovers all models in models/model_*.py, runs CV evaluation,
then a single holdout evaluation. Produces comparison report.
"""

import importlib
import json
import os
import sys
import time

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Add parent dirs to path so we can import competition modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from base_model import BaseModel
from dataset import get_train_test, get_cv_folds
from metrics import (
    compute_all_metrics,
    r2,
    rmse,
    mae,
    mape,
    coverage,
    per_type_r2,
    overfitting_score,
    learning_curve_scores,
)

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
PLOTS_DIR = os.path.join(RESULTS_DIR, "plots")


def discover_models():
    """Auto-discover all model_*.py files in models/ directory."""
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    models = []

    for fname in sorted(os.listdir(models_dir)):
        if fname.startswith("model_") and fname.endswith(".py"):
            module_name = fname[:-3]
            try:
                mod = importlib.import_module(f"models.{module_name}")
                # Find the model class (subclass of BaseModel)
                for attr_name in dir(mod):
                    attr = getattr(mod, attr_name)
                    if (
                        isinstance(attr, type)
                        and issubclass(attr, BaseModel)
                        and attr is not BaseModel
                    ):
                        models.append(attr())
                        break
                else:
                    print(f"  WARNING: No BaseModel subclass found in {fname}")
            except Exception as e:
                print(f"  ERROR loading {fname}: {e}")

    return models


def run_cv(model, X_train, y_train, n_folds=5):
    """Run cross-validation and return metrics."""
    fold_metrics = []
    train_scores = []

    for fold_i, (train_idx, val_idx) in enumerate(get_cv_folds(X_train, y_train)):
        Xtr = X_train.iloc[train_idx].copy()
        ytr = y_train.iloc[train_idx].copy()
        Xval = X_train.iloc[val_idx].copy()
        yval = y_train.iloc[val_idx].copy()

        try:
            model.fit(Xtr, ytr)
            val_preds = model.predict(Xval)
            train_preds = model.predict(Xtr)

            val_m = compute_all_metrics(yval, val_preds, types=Xval["type"].values)
            train_r2 = r2(ytr, train_preds)

            fold_metrics.append(val_m)
            train_scores.append(train_r2)
        except Exception as e:
            print(f"    Fold {fold_i + 1} failed: {e}")

    if not fold_metrics:
        return None

    # Average across folds
    avg = {
        "cv_r2": float(np.mean([m["r2"] for m in fold_metrics])),
        "cv_r2_std": float(np.std([m["r2"] for m in fold_metrics])),
        "cv_rmse": float(np.mean([m["rmse"] for m in fold_metrics])),
        "cv_mae": float(np.mean([m["mae"] for m in fold_metrics])),
        "cv_mape": float(np.mean([m["mape"] for m in fold_metrics])),
        "cv_coverage": float(np.mean([m["coverage"] for m in fold_metrics])),
        "train_r2": float(np.mean(train_scores)),
        "overfit_gap": float(np.mean(train_scores) - np.mean([m["r2"] for m in fold_metrics])),
    }

    # Per-type R² (average across folds)
    all_types = set()
    for m in fold_metrics:
        all_types.update(m.get("per_type_r2", {}).keys())

    per_type = {}
    for t in all_types:
        scores = [m["per_type_r2"].get(t) for m in fold_metrics if t in m.get("per_type_r2", {})]
        scores = [s for s in scores if s is not None and not np.isnan(s)]
        if scores:
            per_type[t] = float(np.mean(scores))

    avg["per_type_r2"] = per_type
    return avg


def run_holdout(model, X_train, y_train, X_test, y_test):
    """Final holdout evaluation (done ONCE)."""
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    metrics = compute_all_metrics(y_test, preds, types=X_test["type"].values)
    return metrics, preds


def plot_residuals(y_true, y_pred, model_name, output_path):
    """Plot residual analysis."""
    mask = ~np.isnan(y_pred) & ~np.isnan(y_true)
    yt = np.array(y_true)[mask]
    yp = np.array(y_pred)[mask]

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    # Predicted vs Actual
    axes[0].scatter(yt, yp, alpha=0.5, s=20)
    mn, mx = min(yt.min(), yp.min()), max(yt.max(), yp.max())
    axes[0].plot([mn, mx], [mn, mx], "r--", linewidth=1)
    axes[0].set_xlabel("Actual Price (EUR)")
    axes[0].set_ylabel("Predicted Price (EUR)")
    axes[0].set_title(f"{model_name}: Predicted vs Actual")

    # Residuals vs Predicted
    residuals = yt - yp
    axes[1].scatter(yp, residuals, alpha=0.5, s=20)
    axes[1].axhline(0, color="r", linestyle="--", linewidth=1)
    axes[1].set_xlabel("Predicted Price (EUR)")
    axes[1].set_ylabel("Residual (Actual - Predicted)")
    axes[1].set_title(f"{model_name}: Residuals")

    plt.tight_layout()
    plt.savefig(output_path, dpi=100, bbox_inches="tight")
    plt.close()


def generate_report(cv_results, holdout_results, models):
    """Generate markdown comparison report."""
    lines = ["# Model Competition Results\n"]
    lines.append(f"Generated: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}\n")

    # Overall ranking table
    lines.append("## Overall Ranking (Holdout Set)\n")
    lines.append("| Rank | Model | R\u00b2 | RMSE | MAE | MAPE | Coverage | Overfit Gap | Flag |")
    lines.append("|------|-------|-----|------|-----|------|----------|-------------|------|")

    # Sort by holdout R²
    ranked = sorted(holdout_results.items(), key=lambda x: -x[1].get("r2", -999))

    for rank, (name, hr) in enumerate(ranked, 1):
        cv = cv_results.get(name, {})
        gap = cv.get("overfit_gap", 0)
        flag = ""
        if gap > 0.15:
            flag = "OVERFIT"
        if hr.get("coverage", 0) < 0.80:
            flag += " LOW-COV"

        # Check per-type negative R² for types with >=10 samples
        ptr = hr.get("per_type_r2", {})
        for t, v in ptr.items():
            if v < 0:
                flag += f" NEG-{t[:8]}"

        lines.append(
            f"| {rank} | {name} | {hr['r2']:.3f} | {hr['rmse']:,.0f} | "
            f"{hr['mae']:,.0f} | {hr['mape']:.1f}% | {hr['coverage']:.1%} | "
            f"{gap:.3f} | {flag.strip()} |"
        )

    # Per-type breakdown
    lines.append("\n## Per-Type R\u00b2 (Holdout)\n")
    all_types = set()
    for hr in holdout_results.values():
        all_types.update(hr.get("per_type_r2", {}).keys())
    all_types = sorted(all_types)

    header = "| Model | " + " | ".join(all_types) + " |"
    sep = "|------|" + "------|" * len(all_types)
    lines.append(header)
    lines.append(sep)

    for name, hr in ranked:
        ptr = hr.get("per_type_r2", {})
        cells = []
        for t in all_types:
            v = ptr.get(t)
            if v is not None:
                cells.append(f"{v:.3f}")
            else:
                cells.append("n/a")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")

    # CV details
    lines.append("\n## Cross-Validation Details\n")
    lines.append("| Model | CV R\u00b2 | CV R\u00b2 Std | Train R\u00b2 | Overfit Gap |")
    lines.append("|-------|--------|-----------|----------|-------------|")

    for name, cv in cv_results.items():
        lines.append(
            f"| {name} | {cv['cv_r2']:.3f} | {cv['cv_r2_std']:.3f} | "
            f"{cv['train_r2']:.3f} | {cv['overfit_gap']:.3f} |"
        )

    # Winner declaration
    lines.append("\n## Winner Declaration\n")

    eligible = []
    for name, hr in ranked:
        cv = cv_results.get(name, {})
        gap = cv.get("overfit_gap", 0)
        cov = hr.get("coverage", 0)

        # Disqualification checks
        if gap > 0.15:
            lines.append(f"- **{name}**: DISQUALIFIED (overfit gap {gap:.3f} > 0.15)")
            continue
        if cov < 0.80:
            lines.append(f"- **{name}**: DISQUALIFIED (coverage {cov:.1%} < 80%)")
            continue

        # Check per-type negative R² on types with >=10 test samples
        disqualified = False
        ptr = hr.get("per_type_r2", {})
        for t, v in ptr.items():
            if v < 0:
                lines.append(f"- **{name}**: DISQUALIFIED (negative R\u00b2 on {t})")
                disqualified = True
                break

        if not disqualified:
            eligible.append((name, hr["r2"]))

    if eligible:
        winner_name, winner_r2 = eligible[0]
        lines.append(f"\n**WINNER: {winner_name}** (Holdout R\u00b2 = {winner_r2:.3f})")
    else:
        lines.append("\nNo model meets all qualification criteria.")

    # Model descriptions
    lines.append("\n## Model Descriptions\n")
    for model in models:
        desc = model.describe()
        lines.append(f"### {model.name}\n")
        lines.append(f"- **Approach**: {desc.get('approach', 'N/A')}")
        lines.append(f"- **Features**: {', '.join(desc.get('features_used', []))}")
        lines.append(f"- **Parameters**: {desc.get('n_parameters', 'N/A')}")
        lines.append("")

    return "\n".join(lines)


def main():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.makedirs(PLOTS_DIR, exist_ok=True)

    print("=" * 60)
    print("MODEL COMPETITION")
    print("=" * 60)

    # Load data
    print("\nLoading data...")
    X_train, X_test, y_train, y_test = get_train_test()
    print(f"  Train: {len(X_train)} vessels, Test: {len(X_test)} vessels")

    # Discover models
    print("\nDiscovering models...")
    models = discover_models()
    print(f"  Found {len(models)} models: {[m.name for m in models]}")

    if not models:
        print("ERROR: No models found. Add model_*.py files to models/ directory.")
        sys.exit(1)

    # Phase 1: Cross-validation
    print("\n" + "-" * 40)
    print("PHASE 1: Cross-Validation")
    print("-" * 40)

    cv_results = {}
    for model in models:
        print(f"\n  [{model.name}]")
        t0 = time.time()
        cv = run_cv(model, X_train, y_train)
        elapsed = time.time() - t0

        if cv is None:
            print(f"    FAILED (all folds errored)")
            continue

        cv_results[model.name] = cv
        flag = " *** OVERFIT ***" if cv["overfit_gap"] > 0.15 else ""
        print(
            f"    CV R\u00b2={cv['cv_r2']:.3f} (±{cv['cv_r2_std']:.3f}), "
            f"Train R\u00b2={cv['train_r2']:.3f}, "
            f"Gap={cv['overfit_gap']:.3f}{flag}, "
            f"Coverage={cv['cv_coverage']:.1%}, "
            f"Time={elapsed:.1f}s"
        )

        # Per-type R²
        for t, v in sorted(cv.get("per_type_r2", {}).items()):
            marker = " <--" if v < 0 else ""
            print(f"      {t}: R\u00b2={v:.3f}{marker}")

    # Phase 2: Holdout evaluation
    print("\n" + "-" * 40)
    print("PHASE 2: Holdout Evaluation (FINAL)")
    print("-" * 40)

    holdout_results = {}
    for model in models:
        if model.name not in cv_results:
            continue

        print(f"\n  [{model.name}]")
        hr, preds = run_holdout(model, X_train, y_train, X_test, y_test)
        holdout_results[model.name] = hr

        print(
            f"    Holdout R\u00b2={hr['r2']:.3f}, "
            f"RMSE={hr['rmse']:,.0f}, "
            f"MAE={hr['mae']:,.0f}, "
            f"MAPE={hr['mape']:.1f}%, "
            f"Coverage={hr['coverage']:.1%}"
        )

        # Per-type
        for t, v in sorted(hr.get("per_type_r2", {}).items()):
            marker = " <-- NEGATIVE" if v < 0 else ""
            print(f"      {t}: R\u00b2={v:.3f}{marker}")

        # Plot residuals
        plot_path = os.path.join(PLOTS_DIR, f"residuals_{model.name.replace(' ', '_').lower()}.png")
        plot_residuals(y_test, preds, model.name, plot_path)

    # Phase 3: Report
    print("\n" + "-" * 40)
    print("PHASE 3: Results")
    print("-" * 40)

    report = generate_report(cv_results, holdout_results, models)
    report_path = os.path.join(RESULTS_DIR, "comparison_report.md")
    with open(report_path, "w") as f:
        f.write(report)
    print(f"\n  Report: {report_path}")

    # Save raw results
    cv_path = os.path.join(RESULTS_DIR, "cv_results.json")
    with open(cv_path, "w") as f:
        json.dump(cv_results, f, indent=2, default=str)

    holdout_path = os.path.join(RESULTS_DIR, "holdout_results.json")
    with open(holdout_path, "w") as f:
        json.dump(holdout_results, f, indent=2, default=str)

    print(f"  CV results: {cv_path}")
    print(f"  Holdout results: {holdout_path}")

    # Print final ranking
    print("\n" + "=" * 60)
    print("FINAL RANKING")
    print("=" * 60)
    ranked = sorted(holdout_results.items(), key=lambda x: -x[1].get("r2", -999))
    for i, (name, hr) in enumerate(ranked, 1):
        cv = cv_results.get(name, {})
        gap = cv.get("overfit_gap", 0)
        flag = ""
        if gap > 0.15:
            flag = " [OVERFIT]"
        if hr.get("coverage", 0) < 0.80:
            flag += " [LOW-COV]"
        print(f"  {i}. {name}: R\u00b2={hr['r2']:.3f}{flag}")


if __name__ == "__main__":
    main()
