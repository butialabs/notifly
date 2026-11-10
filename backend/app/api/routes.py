from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app import i18n, scheduler
from app.airports.index import resolve_place, search_airlines, search_places
from app.api.serializers import channel_out, rule_out, snapshot_out, trip_out, watch_out
from app.config import get_settings
from app.db import get_session
from app.models import (
    AlertRule,
    FlightWatch,
    NotificationChannel,
    NotificationLog,
    PriceSnapshot,
    Trip,
)
from app.providers.base import ProviderError
from app.schemas import (
    ChannelIn,
    ChannelPatch,
    FlightQuery,
    RuleIn,
    RulePatch,
    SearchResult,
    TripIn,
    TripPatch,
    WatchIn,
    WatchPatch,
)
from app.services import notifier
from app.services.booking_links import booking_links
from app.services.checker import AlreadyRunning, check_watch
from app.services.search import SearchBusy, run_search

router = APIRouter(prefix="/api")
DEFAULT_TRIP_EMOJI = "✈️"


def _limit(session: Session, model, maximum: int, what: str) -> None:
    from sqlalchemy import func

    if session.exec(select(func.count()).select_from(model)).one() >= maximum:
        raise HTTPException(409, i18n.t("limit.reached", maximum=maximum, what=i18n.t(what)))


def _get(session: Session, model, id_: int):
    obj = session.get(model, id_)
    if obj is None:
        raise HTTPException(404, i18n.t("http.not_found"))
    return obj


# ------------------------------------------------------------------ meta
@router.get("/health")
def health():
    return {"ok": True}


@router.get("/settings")
def settings():
    s = get_settings()
    return {
        "currency": s.currency,
        "language": s.language,
        "country": s.country,
        "default_check_interval_minutes": s.default_check_interval_minutes,
        "min_check_interval_minutes": s.min_check_interval_minutes,
        "scheduler_enabled": s.scheduler_enabled,
    }


@router.get("/airports")
def airports(q: str = Query(..., min_length=1, max_length=100), limit: int = Query(10, ge=1, le=30)):
    return search_places(q, limit)


@router.get("/places/resolve")
def place_resolve(codes: str = Query(..., min_length=3, max_length=200)):
    return resolve_place(codes.split(","))


@router.get("/airlines")
def airlines(q: str = Query(..., min_length=1, max_length=100), limit: int = Query(10, ge=1, le=30)):
    return search_airlines(q, limit)


# ------------------------------------------------------------------ quick search
@router.post("/search", response_model=SearchResult)
def search(query: FlightQuery):
    try:
        result = run_search(query, max_wait=get_settings().search_queue_max_seconds)
    except SearchBusy as e:
        raise HTTPException(429, str(e)) from e
    except ProviderError as e:
        raise HTTPException(502, str(e)) from e
    # copy: the result comes from the cache and the checker reuses it
    return result.model_copy(
        update={
            "links": booking_links(query),
            "offers": [o.model_copy(update={"links": booking_links(query, o)}) for o in result.offers],
        }
    )


# ------------------------------------------------------------------ trips
@router.get("/trips")
def list_trips(archived: bool = False, session: Session = Depends(get_session)):
    trips = session.exec(select(Trip).where(Trip.archived == archived).order_by(Trip.created_at.desc())).all()
    return [trip_out(session, t) for t in trips]


@router.post("/trips", status_code=201)
def create_trip(data: TripIn, session: Session = Depends(get_session)):
    t = Trip(**data.model_dump())
    t.emoji = (t.emoji or "").strip() or DEFAULT_TRIP_EMOJI
    session.add(t)
    session.commit()
    session.refresh(t)
    return trip_out(session, t)


@router.get("/trips/{trip_id}")
def get_trip(trip_id: int, session: Session = Depends(get_session)):
    return trip_out(session, _get(session, Trip, trip_id), with_watches=True)


@router.patch("/trips/{trip_id}")
def update_trip(trip_id: int, data: TripPatch, session: Session = Depends(get_session)):
    t = _get(session, Trip, trip_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    session.add(t)
    session.commit()
    if data.archived is not None:
        for w in t.watches:
            if data.archived:
                scheduler.unschedule(w.id)
            elif w.active:
                scheduler.schedule(w)
    session.refresh(t)
    return trip_out(session, t)


@router.delete("/trips/{trip_id}", status_code=204)
def delete_trip(trip_id: int, session: Session = Depends(get_session)):
    t = _get(session, Trip, trip_id)
    for w in t.watches:
        scheduler.unschedule(w.id)
    session.delete(t)
    session.commit()


# ------------------------------------------------------------------ tracked flights
def _interval(value: int | None) -> int:
    s = get_settings()
    v = value or s.default_check_interval_minutes
    return max(v, s.min_check_interval_minutes)


@router.post("/trips/{trip_id}/watches", status_code=201)
def create_watch(trip_id: int, data: WatchIn, session: Session = Depends(get_session)):
    _get(session, Trip, trip_id)
    _limit(session, FlightWatch, get_settings().max_watches, "limit.watches")
    w = FlightWatch(
        trip_id=trip_id,
        label=data.label,
        query=data.query.model_dump(mode="json"),
        check_interval_minutes=_interval(data.check_interval_minutes),
        active=data.active,
    )
    session.add(w)
    session.commit()
    session.refresh(w)
    scheduler.schedule(w)  # first check in ~5 s
    return watch_out(session, w)


@router.get("/watches")
def list_watches(session: Session = Depends(get_session)):
    return [watch_out(session, w, spark=False) for w in session.exec(select(FlightWatch)).all()]


@router.get("/watches/{watch_id}")
def get_watch(watch_id: int, session: Session = Depends(get_session)):
    w = _get(session, FlightWatch, watch_id)
    data = watch_out(session, w)
    data["trip"] = {"id": w.trip.id, "name": w.trip.name, "emoji": w.trip.emoji}
    return data


@router.patch("/watches/{watch_id}")
def update_watch(watch_id: int, data: WatchPatch, session: Session = Depends(get_session)):
    w = _get(session, FlightWatch, watch_id)
    patch = data.model_dump(exclude_unset=True)
    if "query" in patch and data.query is not None:
        w.query = data.query.model_dump(mode="json")
        # New query: reset the stats so old prices aren't compared with new ones.
        w.last_price = w.previous_price = w.lowest_price = w.highest_price = None
        w.lowest_price_at = None
        w.last_checked_at = None
    if "label" in patch:
        w.label = data.label
    if data.check_interval_minutes is not None:
        w.check_interval_minutes = _interval(data.check_interval_minutes)
    if data.active is not None:
        w.active = data.active
        if data.active:
            w.consecutive_errors = 0
    if data.trip_id is not None:
        _get(session, Trip, data.trip_id)
        w.trip_id = data.trip_id
    session.add(w)
    session.commit()
    session.refresh(w)
    scheduler.schedule(w)
    return watch_out(session, w)


@router.delete("/watches/{watch_id}", status_code=204)
def delete_watch(watch_id: int, session: Session = Depends(get_session)):
    w = _get(session, FlightWatch, watch_id)
    scheduler.unschedule(w.id)
    session.delete(w)
    session.commit()


@router.post("/watches/{watch_id}/check")
def check_now(watch_id: int, session: Session = Depends(get_session)):
    w0 = _get(session, FlightWatch, watch_id)
    cooldown = get_settings().manual_check_cooldown_seconds
    if cooldown and w0.last_checked_at:
        elapsed = (dt.datetime.now(dt.UTC).replace(tzinfo=None) - w0.last_checked_at).total_seconds()
        if elapsed < cooldown:
            wait = int(cooldown - elapsed) + 1
            raise HTTPException(
                429,
                i18n.t("check.cooldown", elapsed=int(elapsed), wait=wait),
            )
    try:
        snap = check_watch(watch_id)
    except AlreadyRunning:
        raise HTTPException(409, i18n.t("check.running")) from None
    session.expire_all()
    w = _get(session, FlightWatch, watch_id)
    if w.active:
        scheduler.schedule(w)
    return {"snapshot": snapshot_out(snap, FlightQuery.model_validate(w.query)), "watch": watch_out(session, w)}


@router.get("/watches/{watch_id}/history")
def history(watch_id: int, days: int = Query(365, ge=1, le=3650), session: Session = Depends(get_session)):
    since = dt.datetime.now(dt.UTC).replace(tzinfo=None) - dt.timedelta(days=days)
    rows = session.exec(
        select(PriceSnapshot)
        .where(PriceSnapshot.watch_id == watch_id, PriceSnapshot.checked_at >= since)
        .order_by(PriceSnapshot.checked_at)
    ).all()
    return [
        {
            "id": r.id,
            "checked_at": r.checked_at.isoformat(),
            "ok": r.ok,
            "error": r.error,
            "min_price": r.min_price,
            "median_price": r.median_price,
            "currency": r.currency,
            "result_count": r.result_count,
        }
        for r in rows
    ]


@router.get("/watches/{watch_id}/latest")
def latest(watch_id: int, session: Session = Depends(get_session)):
    snap = session.exec(
        select(PriceSnapshot)
        .where(PriceSnapshot.watch_id == watch_id, PriceSnapshot.ok == True)  # noqa: E712
        .order_by(PriceSnapshot.checked_at.desc())
        .limit(1)
    ).first()
    w = _get(session, FlightWatch, watch_id)
    return snapshot_out(snap, FlightQuery.model_validate(w.query))


# ------------------------------------------------------------------ channels
@router.get("/channels")
def list_channels(session: Session = Depends(get_session)):
    return [channel_out(c) for c in session.exec(select(NotificationChannel).order_by(NotificationChannel.id)).all()]


@router.post("/channels", status_code=201)
def create_channel(data: ChannelIn, session: Session = Depends(get_session)):
    _limit(session, NotificationChannel, get_settings().max_channels, "limit.channels")
    if not notifier.validate_url(data.url):
        raise HTTPException(400, i18n.t("channel.invalid_url"))
    ch = NotificationChannel(**data.model_dump())
    session.add(ch)
    session.commit()
    session.refresh(ch)
    return channel_out(ch)


@router.patch("/channels/{channel_id}")
def update_channel(channel_id: int, data: ChannelPatch, session: Session = Depends(get_session)):
    ch = _get(session, NotificationChannel, channel_id)
    if data.url is not None and not notifier.validate_url(data.url):
        raise HTTPException(400, i18n.t("channel.invalid_url"))
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(ch, k, v)
    session.add(ch)
    session.commit()
    session.refresh(ch)
    return channel_out(ch)


@router.delete("/channels/{channel_id}", status_code=204)
def delete_channel(channel_id: int, session: Session = Depends(get_session)):
    session.delete(_get(session, NotificationChannel, channel_id))
    session.commit()


@router.post("/channels/{channel_id}/test")
def test_channel(channel_id: int, session: Session = Depends(get_session)):
    ch = _get(session, NotificationChannel, channel_id)
    title = i18n.t("channel.test_title")
    body = i18n.t("channel.test_body", name=ch.name)
    res = notifier.send(ch.url, title, body)
    session.add(
        NotificationLog(channel_id=ch.id, title=title, body=body, ok=res.ok, error=res.error, is_test=True)
    )
    session.commit()
    return {"ok": res.ok, "error": res.error}


# ------------------------------------------------------------------ rules
def _channels(session: Session, ids: list[int]) -> list[NotificationChannel]:
    return [_get(session, NotificationChannel, i) for i in dict.fromkeys(ids)]


@router.get("/rules")
def list_rules(
    trip_id: int | None = None, watch_id: int | None = None, session: Session = Depends(get_session)
):
    stmt = select(AlertRule).order_by(AlertRule.id)
    if watch_id is not None:
        stmt = stmt.where(AlertRule.watch_id == watch_id)
    elif trip_id is not None:
        stmt = stmt.where(AlertRule.trip_id == trip_id, AlertRule.watch_id == None)  # noqa: E711
    return [rule_out(r) for r in session.exec(stmt).all()]


@router.post("/rules", status_code=201)
def create_rule(data: RuleIn, session: Session = Depends(get_session)):
    _limit(session, AlertRule, get_settings().max_rules, "limit.rules")
    if data.watch_id is not None:
        w = _get(session, FlightWatch, data.watch_id)
        data.trip_id = w.trip_id
    elif data.trip_id is not None:
        _get(session, Trip, data.trip_id)
    r = AlertRule(**data.model_dump(exclude={"channel_ids"}))
    r.channels = _channels(session, data.channel_ids)
    session.add(r)
    session.commit()
    session.refresh(r)
    return rule_out(r)


@router.patch("/rules/{rule_id}")
def update_rule(rule_id: int, data: RulePatch, session: Session = Depends(get_session)):
    r = _get(session, AlertRule, rule_id)
    patch = data.model_dump(exclude_unset=True)
    ids = patch.pop("channel_ids", None)
    for k, v in patch.items():
        setattr(r, k, v)
    if r.kind in ("below_threshold", "above_threshold") and r.threshold is None:
        raise HTTPException(400, i18n.t("rule.threshold_required"))
    if ids is not None:
        r.channels = _channels(session, ids)
    session.add(r)
    session.commit()
    session.refresh(r)
    return rule_out(r)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    session.delete(_get(session, AlertRule, rule_id))
    session.commit()


# ------------------------------------------------------------------ log
@router.get("/notifications")
def list_notifications(
    limit: int = Query(100, ge=1, le=500), watch_id: int | None = None, session: Session = Depends(get_session)
):
    stmt = select(NotificationLog).order_by(NotificationLog.created_at.desc()).limit(limit)
    if watch_id is not None:
        stmt = stmt.where(NotificationLog.watch_id == watch_id)
    return session.exec(stmt).all()
