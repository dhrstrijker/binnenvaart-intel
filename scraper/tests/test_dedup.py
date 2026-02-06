from db import _dims_match, _build_clusters, _pick_canonical, _source_entry


def _vessel(
    id="v1",
    name="Test Vessel",
    source="src_a",
    length_m=80.0,
    width_m=9.5,
    price=500000,
    raw_details=None,
    first_seen_at="2025-01-01T00:00:00Z",
    url="https://example.com/v1",
):
    return {
        "id": id,
        "name": name,
        "source": source,
        "length_m": length_m,
        "width_m": width_m,
        "price": price,
        "raw_details": raw_details,
        "first_seen_at": first_seen_at,
        "url": url,
    }


class TestDimsMatch:
    def test_exact_match(self):
        a = _vessel(length_m=80, width_m=9.5)
        b = _vessel(length_m=80, width_m=9.5)
        assert _dims_match(a, b) is True

    def test_within_tolerance(self):
        a = _vessel(length_m=80, width_m=9.5)
        b = _vessel(length_m=81.5, width_m=10.2)
        assert _dims_match(a, b) is True

    def test_at_length_boundary(self):
        a = _vessel(length_m=80, width_m=9.5)
        b = _vessel(length_m=82, width_m=9.5)
        assert _dims_match(a, b) is True

    def test_length_exceeds_tolerance(self):
        a = _vessel(length_m=80, width_m=9.5)
        b = _vessel(length_m=82.5, width_m=9.5)
        assert _dims_match(a, b) is False

    def test_at_width_boundary(self):
        a = _vessel(length_m=80, width_m=9.5)
        b = _vessel(length_m=80, width_m=10.5)
        assert _dims_match(a, b) is True

    def test_width_exceeds_tolerance(self):
        a = _vessel(length_m=80, width_m=9.5)
        b = _vessel(length_m=80, width_m=10.6)
        assert _dims_match(a, b) is False

    def test_null_length_a(self):
        a = _vessel(length_m=None, width_m=9.5)
        b = _vessel(length_m=80, width_m=9.5)
        assert _dims_match(a, b) is False

    def test_null_width_b(self):
        a = _vessel(length_m=80, width_m=9.5)
        b = _vessel(length_m=80, width_m=None)
        assert _dims_match(a, b) is False

    def test_both_null_dims(self):
        a = _vessel(length_m=None, width_m=None)
        b = _vessel(length_m=None, width_m=None)
        assert _dims_match(a, b) is False


class TestBuildClusters:
    def test_two_matching_vessels(self):
        group = [
            _vessel(id="v1", length_m=80, width_m=9.5),
            _vessel(id="v2", length_m=81, width_m=9.8),
        ]
        clusters = _build_clusters(group)
        assert len(clusters) == 1
        assert len(clusters[0]) == 2

    def test_two_non_matching_vessels(self):
        group = [
            _vessel(id="v1", length_m=80, width_m=9.5),
            _vessel(id="v2", length_m=120, width_m=12),
        ]
        clusters = _build_clusters(group)
        assert len(clusters) == 2
        assert all(len(c) == 1 for c in clusters)

    def test_three_way_duplicate(self):
        group = [
            _vessel(id="v1", length_m=80, width_m=9.5),
            _vessel(id="v2", length_m=80.5, width_m=9.7),
            _vessel(id="v3", length_m=81, width_m=9.3),
        ]
        clusters = _build_clusters(group)
        assert len(clusters) == 1
        assert len(clusters[0]) == 3

    def test_null_dims_not_clustered(self):
        group = [
            _vessel(id="v1", length_m=80, width_m=9.5),
            _vessel(id="v2", length_m=None, width_m=None),
        ]
        clusters = _build_clusters(group)
        assert len(clusters) == 2

    def test_mixed_cluster_and_singleton(self):
        group = [
            _vessel(id="v1", length_m=80, width_m=9.5),
            _vessel(id="v2", length_m=80.5, width_m=9.7),
            _vessel(id="v3", length_m=120, width_m=14),
        ]
        clusters = _build_clusters(group)
        assert len(clusters) == 2
        sizes = sorted(len(c) for c in clusters)
        assert sizes == [1, 2]


class TestPickCanonical:
    def test_prefers_vessel_with_price(self):
        cluster = [
            _vessel(id="v1", price=None, first_seen_at="2025-01-01T00:00:00Z"),
            _vessel(id="v2", price=500000, first_seen_at="2025-02-01T00:00:00Z"),
        ]
        assert _pick_canonical(cluster)["id"] == "v2"

    def test_prefers_raw_details_when_both_have_price(self):
        cluster = [
            _vessel(id="v1", price=500000, raw_details=None),
            _vessel(id="v2", price=600000, raw_details={"key": "val"}),
        ]
        assert _pick_canonical(cluster)["id"] == "v2"

    def test_prefers_earliest_first_seen(self):
        cluster = [
            _vessel(id="v1", price=500000, raw_details={"a": 1}, first_seen_at="2025-03-01T00:00:00Z"),
            _vessel(id="v2", price=600000, raw_details={"b": 2}, first_seen_at="2025-01-01T00:00:00Z"),
        ]
        assert _pick_canonical(cluster)["id"] == "v2"

    def test_single_vessel(self):
        cluster = [_vessel(id="v1")]
        assert _pick_canonical(cluster)["id"] == "v1"


class TestSourceEntry:
    def test_basic_entry(self):
        v = _vessel(id="v1", source="pcshipbrokers", price=695000, url="https://example.com")
        entry = _source_entry(v)
        assert entry == {
            "source": "pcshipbrokers",
            "price": 695000,
            "url": "https://example.com",
            "vessel_id": "v1",
        }

    def test_null_price(self):
        v = _vessel(id="v2", source="galle", price=None, url="https://galle.nl")
        entry = _source_entry(v)
        assert entry["price"] is None

    def test_missing_url(self):
        v = _vessel(id="v3", source="gtsschepen", url=None)
        entry = _source_entry(v)
        assert entry["url"] == ""
