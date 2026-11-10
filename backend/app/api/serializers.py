from __future__ import annotations

from sqlmodel import Session, select

from app import scheduler
from app.models import AlertRule, FlightWatch, NotificationChannel, NotificationLog, PriceSnapshot, Trip
from app.schemas import FlightQuery
from app.services.booking_links import booking_links, google_flights_url, with_offer_links


def watch_out(session: Session, w: FlightWatch, spark: bool = True) -> dict:
    q = FlightQuery.model_validate(w.query)
    data = w.model_dump(mode="json")
    data["route"] = q.route_label()
    data["google_flights_url"] = google_flights_url(q)
    data["links"] = booking_links(q)
    nr = scheduler.next_run(w.id)
    data["next_check_at"] = nr.isoformat() if nr else None
    if spark:
        rows = session.exec(
            select(PriceSnapshot.checked_at, PriceSnapshot.min_price)
            .where(PriceSnapshot.watch_id == w.id, PriceSnapshot.min_price != None)  # noqa: E711
            .order_by(PriceSnapshot.checked_at.desc())
            .limit(30)
        ).all()
        data["sparkline"] = [{"t": t.isoformat(), "p": p} for t, p in reversed(rows)]
    last_ok = session.exec(
        select(PriceSnapshot.provider)
        .where(PriceSnapshot.watch_id == w.id, PriceSnapshot.ok == True)  # noqa: E712
        .order_by(PriceSnapshot.checked_at.desc())
        .limit(1)
    ).first()
    data["last_provider"] = last_ok
    last_alert = session.exec(
        select(NotificationLog)
        .where(NotificationLog.watch_id == w.id, NotificationLog.is_test == False)  # noqa: E712
        .order_by(NotificationLog.created_at.desc())
        .limit(1)
    ).first()
    data["last_alert"] = (
        {
            "created_at": last_alert.created_at.isoformat(),
            "kind": last_alert.kind,
            "rule_id": last_alert.rule_id,
            "title": last_alert.title,
            "ok": last_alert.ok,
        }
        if last_alert
        else None
    )
    from app.services.checker import applicable_rules

    data["applicable_rules"] = [
        {**rule_out(r), "scope": "watch" if r.watch_id else ("trip" if r.trip_id else "global")}
        for r in applicable_rules(session, w)
    ]
    return data


def _watch_sort_key(w: FlightWatch):
    """Trip flights in date order (outbound, then return; ties by creation)."""
    q = FlightQuery.model_validate(w.query)
    return (q.first_date, q.last_date, w.id)


def trip_out(session: Session, t: Trip, with_watches: bool = False) -> dict:
    data = t.model_dump(mode="json")
    watches = sorted(t.watches, key=_watch_sort_key)
    prices = [w.last_price for w in watches if w.last_price is not None]
    data["watch_count"] = len(watches)
    data["active_watch_count"] = sum(1 for w in watches if w.active)
    data["best_price"] = min(prices) if prices else None
    data["currency"] = next((w.currency for w in watches if w.currency), None)
    data["rule_count"] = len(
        session.exec(select(AlertRule.id).where(AlertRule.trip_id == t.id)).all()
    )
    if with_watches:
        data["watches"] = [watch_out(session, w) for w in watches]
    else:
        dates = []
        data["watch_prices"] = []
        for w in watches:
            q = FlightQuery.model_validate(w.query)
            dates += [q.first_date, q.last_date]
            data["watch_prices"].append(
                {
                    "id": w.id,
                    "route": q.route_label(),
                    "label": w.label,
                    "date": q.first_date.isoformat(),
                    "return_date": q.return_date.isoformat() if q.return_date else None,
                    "price": w.last_price,
                    "currency": w.currency,
                    "active": w.active,
                }
            )
        data["start_date"] = min(dates).isoformat() if dates else None
        data["end_date"] = max(dates).isoformat() if dates else None
    return data


def rule_out(r: AlertRule) -> dict:
    data = r.model_dump(mode="json")
    data["channel_ids"] = [c.id for c in r.channels]
    return data


def snapshot_out(snap: PriceSnapshot | None, q: FlightQuery) -> dict | None:
    """Snapshot with booking links on each offer (built now, not stored)."""
    if snap is None:
        return None
    data = snap.model_dump(mode="json")
    data["offers"] = with_offer_links(q, data.get("offers")) if data.get("offers") else data.get("offers")
    if data.get("best_offer"):
        data["best_offer"] = with_offer_links(q, [data["best_offer"]])[0]
    return data


def channel_out(ch: NotificationChannel) -> dict:
    """Channel without the full URL, which holds tokens and passwords."""
    from app.services.notifier import mask_url

    return {
        "id": ch.id,
        "name": ch.name,
        "url_masked": mask_url(ch.url),
        "enabled": ch.enabled,
        "created_at": ch.created_at,
    }
