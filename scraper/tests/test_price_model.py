"""Tests for the KNN price prediction model."""

import math
import sys
import os

# Add scraper directory to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import price_model


def _vessel(
    id="v1",
    name="Test",
    type="Motorvrachtschip",
    length_m=80,
    width_m=9.5,
    tonnage=1200,
    build_year=1990,
    price=500000,
    condition_signals=None,
):
    return {
        "id": id,
        "name": name,
        "type": type,
        "length_m": length_m,
        "width_m": width_m,
        "tonnage": tonnage,
        "build_year": build_year,
        "price": price,
        "source": "test",
        "condition_signals": condition_signals,
    }


class TestGetFeatures:
    def test_basic_features(self):
        v = _vessel()
        f = price_model._get_features(v)
        assert f is not None
        assert f["length_m"] == 80
        assert f["width_m"] == 9.5
        assert f["tonnage"] == 1200
        assert f["age"] == 2026 - 1990

    def test_missing_length(self):
        v = _vessel(length_m=None)
        assert price_model._get_features(v) is None

    def test_missing_width(self):
        v = _vessel(width_m=None)
        assert price_model._get_features(v) is None

    def test_missing_optional_fields(self):
        v = _vessel(tonnage=None, build_year=None)
        f = price_model._get_features(v)
        assert f is not None
        assert f["tonnage"] == 0
        assert f["age"] is None

    def test_engine_from_condition_signals(self):
        v = _vessel(condition_signals={"engine_hp": 800, "engine_year": 2015})
        f = price_model._get_features(v)
        assert f is not None
        assert f["engine_hp"] == 800
        assert f["engine_year"] == 2015


class TestComputeDistance:
    def test_identical_features(self):
        f = {"length_m": 80, "width_m": 9.5, "tonnage": 1200, "age": 36, "engine_hp": None, "engine_year": None}
        assert price_model._compute_distance(f, f) == 0.0

    def test_different_features(self):
        a = {"length_m": 80, "width_m": 9.5, "tonnage": 1200, "age": 36, "engine_hp": None, "engine_year": None}
        b = {"length_m": 85, "width_m": 10, "tonnage": 1500, "age": 30, "engine_hp": None, "engine_year": None}
        d = price_model._compute_distance(a, b)
        assert d > 0

    def test_few_shared_dims_returns_inf(self):
        a = {"length_m": 80, "width_m": None, "tonnage": None, "age": None, "engine_hp": None, "engine_year": None}
        b = {"length_m": 85, "width_m": None, "tonnage": None, "age": None, "engine_hp": None, "engine_year": None}
        assert price_model._compute_distance(a, b) == float("inf")


class TestComputeConfidence:
    def test_high_confidence(self):
        assert price_model._compute_confidence(3.0, 0.1) == "high"

    def test_medium_confidence(self):
        assert price_model._compute_confidence(10.0, 0.5) == "medium"

    def test_low_confidence(self):
        assert price_model._compute_confidence(20.0, 1.0) == "low"

    def test_boundary_high(self):
        assert price_model._compute_confidence(6.0, 0.3) == "high"

    def test_boundary_medium(self):
        assert price_model._compute_confidence(15.0, 0.7) == "medium"


class TestFactorAdjustment:
    def test_no_signals(self):
        target = _vessel()
        neighbors = [_vessel(id="n1"), _vessel(id="n2")]
        adj = price_model._compute_factor_adjustment(target, neighbors)
        assert adj == 0.0

    def test_positive_adjustment(self):
        target = _vessel(
            condition_signals={
                "value_factors_positive": ["new engine", "double hull", "renovation"],
                "value_factors_negative": [],
            }
        )
        neighbors = [
            _vessel(id="n1", condition_signals={"value_factors_positive": [], "value_factors_negative": []}),
        ]
        adj = price_model._compute_factor_adjustment(target, neighbors)
        assert adj > 0
        assert abs(adj - 0.15) < 1e-10  # 3 * 0.05

    def test_negative_adjustment(self):
        target = _vessel(
            condition_signals={
                "value_factors_positive": [],
                "value_factors_negative": ["old engine", "no certs", "rust"],
            }
        )
        neighbors = [
            _vessel(id="n1", condition_signals={"value_factors_positive": [], "value_factors_negative": []}),
        ]
        adj = price_model._compute_factor_adjustment(target, neighbors)
        assert adj < 0
        assert abs(adj - (-0.15)) < 1e-10  # -3 * 0.05

    def test_cap_at_20_percent(self):
        target = _vessel(
            condition_signals={
                "value_factors_positive": ["a", "b", "c", "d", "e", "f"],
                "value_factors_negative": [],
            }
        )
        neighbors = [
            _vessel(id="n1", condition_signals={"value_factors_positive": [], "value_factors_negative": []}),
        ]
        adj = price_model._compute_factor_adjustment(target, neighbors)
        assert adj == 0.20  # capped


class TestKnnPredict:
    def test_basic_prediction(self):
        target = _vessel(id="target", price=None)
        target_features = price_model._get_features(target)
        fleet = [
            (_vessel(id="n1", price=400000), price_model._get_features(_vessel(id="n1", price=400000))),
            (_vessel(id="n2", price=500000), price_model._get_features(_vessel(id="n2", price=500000))),
            (_vessel(id="n3", price=600000), price_model._get_features(_vessel(id="n3", price=600000))),
        ]
        result = price_model._knn_predict(target, target_features, fleet)
        assert result is not None
        assert result["predicted_price"] > 0
        assert result["prediction_confidence"] in ("high", "medium", "low")
        assert result["prediction_range_low"] < result["predicted_price"]
        assert result["prediction_range_high"] > result["predicted_price"]

    def test_no_neighbors_returns_none(self):
        target = _vessel(id="target", type="UniqueType")
        target_features = price_model._get_features(target)
        # Empty fleet
        result = price_model._knn_predict(target, target_features, [])
        assert result is None

    def test_skips_self(self):
        target = _vessel(id="target", price=500000)
        target_features = price_model._get_features(target)
        # Only the target itself in the fleet
        fleet = [(target, target_features)]
        result = price_model._knn_predict(target, target_features, fleet)
        assert result is None

    def test_skips_priceless_neighbors(self):
        target = _vessel(id="target")
        target_features = price_model._get_features(target)
        n = _vessel(id="n1", price=None)
        fleet = [(n, price_model._get_features(n))]
        result = price_model._knn_predict(target, target_features, fleet)
        assert result is None

    def test_prefers_same_type(self):
        # When enough same-type neighbors exist, they are used preferentially
        target = _vessel(id="target", type="Motorvrachtschip", length_m=80, width_m=9.5)
        target_features = price_model._get_features(target)

        # 3 same-type vessels at various distances, all priced around 500k
        s1 = _vessel(id="s1", type="Motorvrachtschip", price=480000, length_m=82, width_m=9.6)
        s2 = _vessel(id="s2", type="Motorvrachtschip", price=510000, length_m=78, width_m=9.4)
        s3 = _vessel(id="s3", type="Motorvrachtschip", price=520000, length_m=85, width_m=10.0)

        # Different type, identical dimensions but much higher price
        diff_type = _vessel(id="diff", type="Tankschip", price=1200000, length_m=80, width_m=9.5)

        fleet = [
            (s1, price_model._get_features(s1)),
            (s2, price_model._get_features(s2)),
            (s3, price_model._get_features(s3)),
            (diff_type, price_model._get_features(diff_type)),
        ]
        result = price_model._knn_predict(target, target_features, fleet)
        assert result is not None
        # With 3 same-type neighbors, they fill K=3 and cross-type is excluded
        # Prediction should be around 500k, not 1.2M
        assert result["predicted_price"] < 700000


class TestRangeMargins:
    def test_margins_by_confidence(self):
        assert price_model.RANGE_MARGINS["high"] == 0.15
        assert price_model.RANGE_MARGINS["medium"] == 0.25
        assert price_model.RANGE_MARGINS["low"] == 0.35
