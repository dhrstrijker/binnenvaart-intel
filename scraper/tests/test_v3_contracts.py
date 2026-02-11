from v3.sources.contracts import normalize_sold_flag


def test_normalize_sold_flag_truthy_inputs():
    for value in [True, 1, "1", "true", "yes", "sold", "verkocht"]:
        assert normalize_sold_flag(value, default=False) is True



def test_normalize_sold_flag_falsey_inputs():
    for value in [False, 0, "0", "false", "no", "active", "available", "te koop"]:
        assert normalize_sold_flag(value, default=True) is False



def test_normalize_sold_flag_defaults_for_unknown_values():
    assert normalize_sold_flag("unknown-value", default=False) is False
    assert normalize_sold_flag("unknown-value", default=True) is True
