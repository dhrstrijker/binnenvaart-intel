"""KNN-based price prediction model for inland vessels.

Uses same-type 6-dimensional KNN (length, width, tonnage, age, engine_hp,
engine_year) with K=3 to predict vessel prices. Confidence is computed from
neighbor distance and price coefficient of variation.

Predictions are stored directly in the vessels DB table.
"""

import logging
import math
from datetime import datetime, timezone

from db import supabase

logger = logging.getLogger(__name__)

# Feature weights and normalization divisors for KNN distance
# Each feature is divided by its divisor before distance calculation
FEATURE_CONFIG = {
    "length_m": {"divisor": 1, "weight": 1.0},
    "width_m": {"divisor": 1, "weight": 1.0},
    "tonnage": {"divisor": 100, "weight": 1.0},
    "age": {"divisor": 50, "weight": 1.0},
    "engine_hp": {"divisor": 500, "weight": 1.0},
    "engine_year": {"divisor": 30, "weight": 0.5},
}

# Confidence thresholds (data-driven from analysis)
HIGH_MAX_DIST = 6
HIGH_MAX_CV = 0.3
MEDIUM_MAX_DIST = 15
MEDIUM_MAX_CV = 0.7

# Range margins by confidence
RANGE_MARGINS = {"high": 0.15, "medium": 0.25, "low": 0.35}

K = 3  # Number of neighbors


def _get_features(vessel: dict) -> dict | None:
    """Extract the 6D feature vector from a vessel. Returns None if missing core features."""
    length = vessel.get("length_m")
    width = vessel.get("width_m")
    if length is None or width is None:
        return None

    build_year = vessel.get("build_year")
    age = (datetime.now(timezone.utc).year - build_year) if build_year else None

    signals = vessel.get("condition_signals") or {}
    engine_hp = signals.get("engine_hp")
    engine_year = signals.get("engine_year")

    return {
        "length_m": float(length),
        "width_m": float(width),
        "tonnage": float(vessel.get("tonnage") or 0),
        "age": float(age) if age is not None else None,
        "engine_hp": float(engine_hp) if engine_hp is not None else None,
        "engine_year": float(engine_year) if engine_year is not None else None,
    }


def _compute_distance(a: dict, b: dict) -> float:
    """Compute weighted Euclidean distance between two feature vectors.

    Only uses dimensions where both vectors have values.
    """
    total = 0.0
    dims = 0
    for feat, cfg in FEATURE_CONFIG.items():
        va = a.get(feat)
        vb = b.get(feat)
        if va is None or vb is None:
            continue
        diff = (va - vb) / cfg["divisor"]
        total += cfg["weight"] * diff * diff
        dims += 1

    if dims < 2:
        return float("inf")

    return math.sqrt(total)


def _knn_predict(
    target: dict,
    target_features: dict,
    fleet: list[tuple[dict, dict]],
) -> dict | None:
    """Find K nearest same-type neighbors and predict price.

    Returns dict with predicted_price, confidence, range, or None.
    """
    target_type = target.get("type")
    target_id = target.get("id")

    # Compute distances to all candidates
    candidates = []
    for vessel, features in fleet:
        if vessel.get("id") == target_id:
            continue
        if vessel.get("price") is None or vessel["price"] <= 0:
            continue

        # Prefer same-type, but allow cross-type fallback
        same_type = vessel.get("type") == target_type if target_type else False
        dist = _compute_distance(target_features, features)
        if dist == float("inf"):
            continue

        candidates.append((dist, same_type, vessel))

    # Sort: same-type first, then by distance
    candidates.sort(key=lambda x: (not x[1], x[0]))

    # Take K neighbors (prefer same-type)
    same_type_candidates = [(d, v) for d, st, v in candidates if st]
    cross_type_candidates = [(d, v) for d, st, v in candidates if not st]

    neighbors = []
    for d, v in same_type_candidates[:K]:
        neighbors.append((d, v))
    if len(neighbors) < K:
        for d, v in cross_type_candidates[: K - len(neighbors)]:
            neighbors.append((d, v))

    if not neighbors:
        return None

    # Weighted average (inverse distance weighting)
    prices = [v["price"] for _, v in neighbors]
    distances = [d for d, _ in neighbors]

    if all(d == 0 for d in distances):
        predicted = sum(prices) / len(prices)
    else:
        weights = [1 / (d + 0.001) for d in distances]
        total_weight = sum(weights)
        predicted = sum(p * w for p, w in zip(prices, weights)) / total_weight

    # Factor adjustment from condition signals
    adjustment = _compute_factor_adjustment(target, [v for _, v in neighbors])
    predicted *= (1 + adjustment)

    predicted = round(predicted)

    # Confidence
    avg_dist = sum(distances) / len(distances)
    mean_price = sum(prices) / len(prices)
    if mean_price > 0 and len(prices) > 1:
        variance = sum((p - mean_price) ** 2 for p in prices) / len(prices)
        price_cv = math.sqrt(variance) / mean_price
    else:
        price_cv = 0

    confidence = _compute_confidence(avg_dist, price_cv)
    if confidence is None:
        return None

    margin = RANGE_MARGINS[confidence]

    return {
        "predicted_price": predicted,
        "prediction_confidence": confidence,
        "prediction_range_low": round(predicted * (1 - margin)),
        "prediction_range_high": round(predicted * (1 + margin)),
    }


def _compute_confidence(avg_dist: float, price_cv: float) -> str | None:
    """Compute confidence tier from neighbor distance and price CV.

    Returns 'high', 'medium', 'low', or None (suppress).
    """
    if avg_dist <= HIGH_MAX_DIST and price_cv <= HIGH_MAX_CV:
        return "high"
    if avg_dist <= MEDIUM_MAX_DIST and price_cv <= MEDIUM_MAX_CV:
        return "medium"
    return "low"


def _compute_factor_adjustment(target: dict, neighbors: list[dict]) -> float:
    """Compute price adjustment based on condition signal differences.

    Compares the target's value factors vs neighbors' average.
    Returns a float capped at +-20%.
    """
    target_signals = target.get("condition_signals") or {}
    pos = len(target_signals.get("value_factors_positive") or [])
    neg = len(target_signals.get("value_factors_negative") or [])
    target_net = pos - neg

    neighbor_nets = []
    for n in neighbors:
        ns = n.get("condition_signals") or {}
        np_ = len(ns.get("value_factors_positive") or [])
        nn = len(ns.get("value_factors_negative") or [])
        neighbor_nets.append(np_ - nn)

    if not neighbor_nets:
        return 0.0

    avg_neighbor_net = sum(neighbor_nets) / len(neighbor_nets)
    diff = target_net - avg_neighbor_net

    # Each net factor difference = ~5% adjustment, capped at +-20%
    adjustment = diff * 0.05
    return max(-0.20, min(0.20, adjustment))


def predict_all(vessels: list[dict]) -> dict:
    """Run KNN prediction for all vessels and write results to DB.

    Returns summary dict with counts.
    """
    # Build feature vectors for the whole fleet
    fleet: list[tuple[dict, dict]] = []
    for v in vessels:
        features = _get_features(v)
        if features is not None:
            fleet.append((v, features))

    logger.info("Price model: %d vessels with features out of %d total", len(fleet), len(vessels))

    predicted_count = 0
    suppressed_count = 0
    error_count = 0

    for vessel, features in fleet:
        try:
            result = _knn_predict(vessel, features, fleet)

            if result is None:
                # Clear any stale prediction
                supabase.table("vessels").update({
                    "predicted_price": None,
                    "prediction_confidence": None,
                    "prediction_range_low": None,
                    "prediction_range_high": None,
                }).eq("id", vessel["id"]).execute()
                suppressed_count += 1
                continue

            supabase.table("vessels").update(result).eq("id", vessel["id"]).execute()
            predicted_count += 1
        except Exception:
            logger.exception("Failed to predict/save for %s", vessel.get("name"))
            error_count += 1

    logger.info(
        "Price model done: %d predicted, %d suppressed, %d errors",
        predicted_count, suppressed_count, error_count,
    )
    return {"predicted": predicted_count, "suppressed": suppressed_count, "errors": error_count}
