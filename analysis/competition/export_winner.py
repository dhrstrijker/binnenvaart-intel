#!/usr/bin/env python3
"""
Export the winning model for frontend integration.

- Linear models: update TYPE_COEFFICIENTS in vesselPricing.ts
- Tree models: pre-compute predictions and store in Supabase
- Hybrid: both
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dataset import get_train_test, load_data
from metrics import compute_all_metrics

FRONTEND_PRICING_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "..",
    "frontend",
    "src",
    "lib",
    "vesselPricing.ts",
)


def export_linear_coefficients(model, output_path=None):
    """
    Export linear model coefficients to vesselPricing.ts format.

    The model's export_for_frontend() should return a dict like:
    {
        'Motorvrachtschip': {
            'length': 5680.45, 'tonnage': 697.91, 'build_year': 16382.36,
            'intercept': -32785231.98, 'r2': 0.926, 'label': 'Motorvrachtschip'
        },
        ...
    }
    """
    export_data = model.export_for_frontend()
    if export_data is None:
        print("Model does not support frontend export.")
        return False

    path = output_path or FRONTEND_PRICING_PATH
    if not os.path.exists(path):
        print(f"ERROR: {path} not found")
        return False

    with open(path, "r") as f:
        content = f.read()

    # Build new TYPE_COEFFICIENTS block
    lines = ["export const TYPE_COEFFICIENTS: Record<string, Coefficients> = {"]
    for type_name, coeffs in export_data.items():
        lines.append(f"  {type_name}: {{")
        lines.append(f"    length: {coeffs['length']},")
        lines.append(f"    tonnage: {coeffs['tonnage']},")
        lines.append(f"    build_year: {coeffs['build_year']},")
        lines.append(f"    intercept: {coeffs['intercept']},")
        lines.append(f"    r2: {coeffs['r2']},")
        lines.append(f'    label: "{coeffs["label"]}",')
        lines.append("  },")
    lines.append("};")

    new_block = "\n".join(lines)

    # Replace existing TYPE_COEFFICIENTS block
    pattern = r"export const TYPE_COEFFICIENTS:.*?\n\};"
    new_content = re.sub(pattern, new_block, content, flags=re.DOTALL)

    if new_content == content:
        print("WARNING: Could not find TYPE_COEFFICIENTS block to replace")
        return False

    with open(path, "w") as f:
        f.write(new_content)

    print(f"Updated {path}")
    return True


def export_predictions_json(model, output_path=None):
    """
    Export pre-computed predictions for all vessels.

    Useful for tree/ensemble models that can't be exported as coefficients.
    Output: JSON mapping vessel_id -> predicted_price.
    """
    df = load_data()
    y = df["price"]
    X = df.drop(columns=["price"])

    # Fit on all data
    model.fit(X, y)
    preds = model.predict(X)

    predictions = {}
    for i, row in X.iterrows():
        vid = row.get("id")
        pred = preds[i]
        if vid and not (pred is None or (isinstance(pred, float) and __import__("math").isnan(pred))):
            predictions[vid] = round(float(pred))

    path = output_path or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "results", "predictions.json"
    )

    with open(path, "w") as f:
        json.dump(predictions, f, indent=2)

    print(f"Exported {len(predictions)} predictions to {path}")
    return predictions


def main():
    import importlib

    # Load the best model from results
    results_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "results", "holdout_results.json"
    )

    if not os.path.exists(results_path):
        print("ERROR: Run run_competition.py first to generate results.")
        sys.exit(1)

    with open(results_path) as f:
        holdout = json.load(f)

    cv_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "results", "cv_results.json"
    )
    with open(cv_path) as f:
        cv = json.load(f)

    # Find winner (same logic as run_competition)
    ranked = sorted(holdout.items(), key=lambda x: -x[1].get("r2", -999))
    winner_name = None
    for name, hr in ranked:
        gap = cv.get(name, {}).get("overfit_gap", 0)
        if gap > 0.15:
            continue
        if hr.get("coverage", 0) < 0.80:
            continue
        # Check negative per-type R²
        ok = True
        for t, v in hr.get("per_type_r2", {}).items():
            if v < 0:
                ok = False
                break
        if ok:
            winner_name = name
            break

    if not winner_name:
        print("No eligible winner found.")
        sys.exit(1)

    print(f"Winner: {winner_name}")

    # Discover and instantiate the winner
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    from base_model import BaseModel

    winner_model = None
    for fname in sorted(os.listdir(models_dir)):
        if fname.startswith("model_") and fname.endswith(".py"):
            mod = importlib.import_module(f"models.{fname[:-3]}")
            for attr_name in dir(mod):
                attr = getattr(mod, attr_name)
                if isinstance(attr, type) and issubclass(attr, BaseModel) and attr is not BaseModel:
                    instance = attr()
                    if instance.name == winner_name:
                        winner_model = instance
                        break
            if winner_model:
                break

    if winner_model is None:
        print(f"Could not find model class for '{winner_name}'")
        sys.exit(1)

    # Train on full training set
    X_train, X_test, y_train, y_test = get_train_test()
    winner_model.fit(X_train, y_train)

    # Try linear export first
    if winner_model.export_for_frontend() is not None:
        print("\nExporting as linear coefficients to vesselPricing.ts...")
        export_linear_coefficients(winner_model)
    else:
        print("\nModel doesn't support coefficient export.")
        print("Exporting pre-computed predictions...")
        export_predictions_json(winner_model)


if __name__ == "__main__":
    main()
