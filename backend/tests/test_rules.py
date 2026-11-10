import datetime as dt

from app.services.rules import PriceContext, RuleParams, RuleStateData, evaluate

NOW = dt.datetime(2026, 1, 1, 12)


def ev(kind, cur, prev=None, low=None, state=None, **kw):
    return evaluate(RuleParams(kind=kind, **kw), PriceContext(cur, prev, low), state or RuleStateData(), NOW)


def test_drop_and_rise():
    assert ev("price_drop", 900, 1000).fire
    assert not ev("price_drop", 1100, 1000).fire
    assert ev("price_rise", 1100, 1000).fire
    assert not ev("price_rise", 900, 1000).fire
    assert ev("price_change", 900, 1000).fire and ev("price_change", 1100, 1000).fire
    assert not ev("price_drop", 900, None).fire  # first check


def test_min_change():
    assert not ev("price_drop", 990, 1000, min_change_abs=50).fire
    assert ev("price_drop", 940, 1000, min_change_abs=50).fire
    assert not ev("price_drop", 960, 1000, min_change_pct=5).fire
    assert ev("price_drop", 950, 1000, min_change_pct=5).fire


def test_threshold_armed():
    d = ev("below_threshold", 900, threshold=1000)
    assert d.fire and not d.armed
    # still below and disarmed: no repeat
    d2 = ev("below_threshold", 850, threshold=1000, state=RuleStateData(armed=False))
    assert not d2.fire and not d2.armed
    # went above the threshold: re-armed
    d3 = ev("below_threshold", 1200, threshold=1000, state=RuleStateData(armed=False))
    assert not d3.fire and d3.armed
    # repeats when configured to
    assert ev(
        "below_threshold", 850, threshold=1000, state=RuleStateData(armed=False), repeat_while_matching=True
    ).fire
    assert ev("above_threshold", 1200, threshold=1000).fire


def test_cooldown():
    st = RuleStateData(last_triggered_at=NOW - dt.timedelta(minutes=10))
    d = ev("price_drop", 900, 1000, state=st, cooldown_minutes=60)
    assert not d.fire and d.reason == "cooldown"
    st = RuleStateData(last_triggered_at=NOW - dt.timedelta(minutes=90))
    assert ev("price_drop", 900, 1000, state=st, cooldown_minutes=60).fire
    # threshold in cooldown stays armed
    st = RuleStateData(armed=True, last_triggered_at=NOW - dt.timedelta(minutes=10))
    d = ev("below_threshold", 900, threshold=1000, state=st, cooldown_minutes=60)
    assert not d.fire and d.armed


def test_new_lowest():
    assert ev("new_lowest", 900, 950, low=1000).fire
    assert not ev("new_lowest", 1001, 950, low=1000).fire
    assert not ev("new_lowest", 900, None, low=None).fire
