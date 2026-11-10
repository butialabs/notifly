"""Price alert rule engine (pure, no I/O)."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

KINDS = ("price_drop", "price_rise", "price_change", "below_threshold", "above_threshold", "new_lowest")


def kind_label(kind: str, lang: str | None = None) -> str:
    from app import i18n

    return i18n.t(f"kind.{kind}", lang) if kind in KINDS else kind


@dataclass
class PriceContext:
    current: float | None
    previous: float | None  # price at the previous successful check
    lowest_before: float | None  # lowest price seen before this check


@dataclass
class RuleParams:
    kind: str
    threshold: float | None = None
    min_change_abs: float | None = None
    min_change_pct: float | None = None
    cooldown_minutes: int = 0
    repeat_while_matching: bool = False


@dataclass
class RuleStateData:
    armed: bool = True
    last_triggered_at: dt.datetime | None = None


@dataclass
class Decision:
    fire: bool
    armed: bool
    reason: str | None = None


def _change_ok(p: RuleParams, delta: float, base: float) -> bool:
    """Check the minimum change. `delta` is always positive."""
    if delta <= 0:
        return False
    if p.min_change_abs is not None and delta < p.min_change_abs:
        return False
    if p.min_change_pct is not None and base > 0 and (delta / base * 100) < p.min_change_pct:
        return False
    return True


def evaluate(p: RuleParams, ctx: PriceContext, state: RuleStateData, now: dt.datetime) -> Decision:
    cur = ctx.current
    if cur is None:
        return Decision(False, state.armed)

    matched = False
    armed = state.armed
    reason = None

    if p.kind in ("price_drop", "price_rise", "price_change"):
        if ctx.previous is not None:
            diff = cur - ctx.previous
            if p.kind in ("price_drop", "price_change") and diff < 0 and _change_ok(p, -diff, ctx.previous):
                matched, reason = True, "drop"
            elif p.kind in ("price_rise", "price_change") and diff > 0 and _change_ok(p, diff, ctx.previous):
                matched, reason = True, "rise"

    elif p.kind == "new_lowest":
        if ctx.lowest_before is not None and cur < ctx.lowest_before:
            matched = _change_ok(p, ctx.lowest_before - cur, ctx.lowest_before) or (
                p.min_change_abs is None and p.min_change_pct is None
            )
            reason = "new_lowest"

    elif p.kind in ("below_threshold", "above_threshold"):
        inside = cur <= p.threshold if p.kind == "below_threshold" else cur >= p.threshold
        if not inside:
            # left the range: re-arm to notify the next time it enters
            return Decision(False, True)
        if p.repeat_while_matching or armed:
            matched, reason = True, p.kind
        armed = False

    if not matched:
        return Decision(False, armed)

    if p.cooldown_minutes and state.last_triggered_at is not None:
        if now - state.last_triggered_at < dt.timedelta(minutes=p.cooldown_minutes):
            # thresholds stay armed, since no notification went out
            if p.kind in ("below_threshold", "above_threshold") and not p.repeat_while_matching:
                armed = state.armed
            return Decision(False, armed, "cooldown")

    return Decision(True, armed, reason)
