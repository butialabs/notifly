"""Checks a tracked flight: searches, stores the history, evaluates rules and notifies."""

from __future__ import annotations

import datetime as dt
import logging
import threading

from sqlmodel import Session, or_, select

from app import i18n
from app.config import get_settings
from app.db import get_engine
from app.models import (
    AlertRule,
    FlightWatch,
    NotificationChannel,
    NotificationLog,
    PriceSnapshot,
    RuleState,
    Trip,
    utcnow,
)
from app.providers.base import ProviderError
from app.schemas import FlightQuery
from app.services import notifier
from app.services.booking_links import booking_links
from app.services.rules import PriceContext, RuleParams, RuleStateData, evaluate, kind_label
from app.services.search import run_search

log = logging.getLogger(__name__)
_running: set[int] = set()
_running_lock = threading.Lock()


class AlreadyRunning(Exception):
    pass


def check_watch(watch_id: int) -> PriceSnapshot | None:
    """Entry point for the scheduler and the "Check now" button."""
    with _running_lock:
        if watch_id in _running:
            raise AlreadyRunning()
        _running.add(watch_id)
    # Stored errors and notifications use the server language, even on "Check now"
    token = i18n.set_lang(i18n.default_lang())
    try:
        with Session(get_engine()) as session:
            watch = session.get(FlightWatch, watch_id)
            if watch is None:
                return None
            return _check(session, watch)
    finally:
        i18n.reset_lang(token)
        with _running_lock:
            _running.discard(watch_id)


def _check(session: Session, watch: FlightWatch) -> PriceSnapshot:
    s = get_settings()
    query = FlightQuery.model_validate(watch.query)
    now = utcnow()

    if query.first_date < dt.date.today():
        watch.active = False
        watch.last_error = i18n.t("check.departed")
        session.add(watch)
        session.commit()
        snap = PriceSnapshot(watch_id=watch.id, ok=False, error=watch.last_error)
        return snap

    try:
        result = run_search(query, use_cache=False)
    except ProviderError as e:
        watch.last_checked_at = now
        watch.last_error = str(e)[:500]
        watch.consecutive_errors += 1
        snap = PriceSnapshot(watch_id=watch.id, checked_at=now, ok=False, error=watch.last_error)
        session.add_all([watch, snap])
        session.commit()
        session.refresh(snap)
        return snap

    priced = sorted((o for o in result.offers if o.price is not None), key=lambda o: o.price)
    best = priced[0] if priced else None
    snap = PriceSnapshot(
        watch_id=watch.id,
        checked_at=now,
        ok=True,
        min_price=result.min_price,
        median_price=result.median_price,
        currency=result.currency,
        result_count=result.count,
        best_offer=best.model_dump(mode="json", exclude={"links"}) if best else None,
        offers=[o.model_dump(mode="json", exclude={"links"}) for o in result.offers[: s.offers_kept_per_snapshot]],
        elapsed_ms=result.elapsed_ms,
        provider=result.provider,
    )

    previous = watch.last_price
    lowest_before = watch.lowest_price
    watch.last_checked_at = now
    watch.last_error = None if result.min_price is not None else i18n.t("check.no_price")
    watch.consecutive_errors = 0
    if result.min_price is not None:
        watch.previous_price = previous
        watch.last_price = result.min_price
        watch.currency = result.currency
        if watch.lowest_price is None or result.min_price < watch.lowest_price:
            watch.lowest_price = result.min_price
            watch.lowest_price_at = now
        if watch.highest_price is None or result.min_price > watch.highest_price:
            watch.highest_price = result.min_price
    session.add_all([watch, snap])
    session.commit()
    session.refresh(snap)

    if result.min_price is not None:
        ctx = PriceContext(current=result.min_price, previous=previous, lowest_before=lowest_before)
        _apply_rules(session, watch, query, ctx, snap)
    _prune(session, watch.id)
    return snap


def applicable_rules(session: Session, watch: FlightWatch) -> list[AlertRule]:
    stmt = select(AlertRule).where(
        AlertRule.enabled == True,  # noqa: E712
        or_(
            AlertRule.watch_id == watch.id,
            (AlertRule.trip_id == watch.trip_id) & (AlertRule.watch_id == None),  # noqa: E711
            (AlertRule.trip_id == None) & (AlertRule.watch_id == None),  # noqa: E711
        ),
    )
    return list(session.exec(stmt))


def _apply_rules(session: Session, watch: FlightWatch, query: FlightQuery, ctx: PriceContext, snap) -> None:
    now = utcnow()
    for rule in applicable_rules(session, watch):
        state = session.get(RuleState, (rule.id, watch.id)) or RuleState(rule_id=rule.id, watch_id=watch.id)
        decision = evaluate(
            RuleParams(
                kind=rule.kind,
                threshold=rule.threshold,
                min_change_abs=rule.min_change_abs,
                min_change_pct=rule.min_change_pct,
                cooldown_minutes=rule.cooldown_minutes,
                repeat_while_matching=rule.repeat_while_matching,
            ),
            ctx,
            RuleStateData(armed=state.armed, last_triggered_at=state.last_triggered_at),
            now,
        )
        state.armed = decision.armed
        if decision.fire:
            state.last_triggered_at = now
            title, body = build_message(session, watch, query, rule, ctx, snap)
            channels = rule.channels or list(
                session.exec(select(NotificationChannel).where(NotificationChannel.enabled == True))  # noqa: E712
            )
            if not channels:
                session.add(
                    NotificationLog(
                        rule_id=rule.id, watch_id=watch.id, kind=rule.kind, title=title, body=body,
                        ok=False, error=i18n.t("notify.no_channel"),
                    )
                )
            for ch in channels:
                if not ch.enabled:
                    continue
                res = notifier.send(ch.url, title, body)
                session.add(
                    NotificationLog(
                        rule_id=rule.id, channel_id=ch.id, watch_id=watch.id, kind=rule.kind,
                        title=title, body=body, ok=res.ok, error=res.error,
                    )
                )
        session.add(state)
    session.commit()


def build_message(session, watch: FlightWatch, query: FlightQuery, rule: AlertRule, ctx: PriceContext, snap):
    s = get_settings()
    trip = session.get(Trip, watch.trip_id)
    cur = snap.currency
    money = lambda v: notifier.fmt_money(v, cur)  # noqa: E731
    route = watch.label or query.route_label()
    dates = notifier.fmt_date(query.first_date)
    if query.return_date:
        dates += " – " + notifier.fmt_date(query.return_date)

    change = ""
    if ctx.previous:
        diff = ctx.current - ctx.previous
        if diff:
            arrow = "▼" if diff < 0 else "▲"
            change = f" {arrow} {money(abs(diff))} ({abs(diff) / ctx.previous * 100:.1f}%)"

    if rule.kind in ("price_drop", "price_rise", "price_change", "below_threshold", "above_threshold", "new_lowest"):
        headline = i18n.t(f"notify.{rule.kind}", price=money(ctx.current), threshold=money(rule.threshold))
    else:
        headline = money(ctx.current)
    title = f"✈️ {route}: {headline}"

    lines = [
        f"**{trip.name if trip else i18n.t('notify.trip_fallback')}** · {route}",
        i18n.t("notify.dates", dates=dates),
        i18n.t("notify.current", price=money(ctx.current), change=change),
    ]
    if ctx.previous is not None:
        lines.append(i18n.t("notify.previous", price=money(ctx.previous)))
    if watch.lowest_price is not None:
        lines.append(i18n.t("notify.lowest", price=money(watch.lowest_price)))
    b = snap.best_offer
    if b:
        stops = i18n.t("notify.nonstop") if b["stops"] == 0 else i18n.t("notify.stops", n=b["stops"])
        lines.append(
            i18n.t(
                "notify.best",
                airlines=", ".join(b["airlines"][:3]),
                stops=stops,
                duration=notifier.fmt_duration(b["duration"]),
            )
        )
    lines.append(i18n.t("notify.rule", rule=rule.name or kind_label(rule.kind)))
    links = {lk["id"]: lk for lk in booking_links(query, b)}
    lines.append(" · ".join(f"[{links[k]['name']}]({links[k]['url']})" for k in ("google", "kayak", "skyscanner")))
    lines.append(f"[{i18n.t('notify.open')}]({s.public_url.rstrip('/')}/watches/{watch.id})")
    return title, "\n".join(lines)


def _prune(session: Session, watch_id: int) -> None:
    """Keep full offers only on the last N checks (the price history stays)."""
    keep = get_settings().keep_offers_for_last_snapshots
    old = session.exec(
        select(PriceSnapshot)
        .where(PriceSnapshot.watch_id == watch_id, PriceSnapshot.offers != None)  # noqa: E711
        .order_by(PriceSnapshot.checked_at.desc())
        .offset(keep)
    ).all()
    for snap in old:
        snap.offers = None
        session.add(snap)
    if old:
        session.commit()
