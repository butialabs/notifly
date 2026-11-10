"""In-process scheduler (APScheduler), one job per tracked flight."""

from __future__ import annotations

import datetime as dt
import logging

from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from app.config import get_settings
from app.db import get_engine
from app.models import FlightWatch, Trip
from app.services.checker import AlreadyRunning, check_watch

log = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


def _job_id(watch_id: int) -> str:
    return f"watch-{watch_id}"


def _run(watch_id: int) -> None:
    try:
        snap = check_watch(watch_id)
        if snap is not None:
            log.info("watch %s checado: ok=%s preço=%s", watch_id, snap.ok, snap.min_price)
        with Session(get_engine()) as session:
            w = session.get(FlightWatch, watch_id)
            if w is None or not w.active:
                unschedule(watch_id)
            else:
                job = _scheduler.get_job(_job_id(watch_id)) if _scheduler else None
                wanted = dt.timedelta(minutes=_backoff_minutes(w))
                if job and job.trigger.interval != wanted:
                    schedule(w, first_run=dt.datetime.now(dt.UTC).replace(tzinfo=None) + wanted)
    except AlreadyRunning:
        log.info("watch %s já está em execução", watch_id)
    except Exception:  # noqa: BLE001
        log.exception("Erro ao checar watch %s", watch_id)


def _backoff_minutes(w: FlightWatch) -> int:
    base = max(w.check_interval_minutes, get_settings().min_check_interval_minutes)
    # Consecutive errors stretch the interval (up to 4x) so we don't keep hitting a block.
    return base * min(2 ** max(w.consecutive_errors - 1, 0), 4) if w.consecutive_errors else base


def schedule(w: FlightWatch, first_run: dt.datetime | None = None) -> None:
    if _scheduler is None:
        return
    if not w.active or (w.trip is not None and w.trip.archived):
        unschedule(w.id)
        return
    minutes = _backoff_minutes(w)
    if first_run is None:
        last = w.last_checked_at
        now = dt.datetime.now(dt.UTC).replace(tzinfo=None)
        due = (last + dt.timedelta(minutes=minutes)) if last else now
        first_run = max(due, now + dt.timedelta(seconds=5))
    _scheduler.add_job(
        _run,
        IntervalTrigger(minutes=minutes, jitter=int(minutes * 60 * 0.15), timezone=dt.UTC),
        args=[w.id],
        id=_job_id(w.id),
        replace_existing=True,
        next_run_time=first_run.replace(tzinfo=dt.UTC),
        coalesce=True,
        max_instances=1,
        misfire_grace_time=3600,
    )


def unschedule(watch_id: int) -> None:
    if _scheduler is None:
        return
    job = _scheduler.get_job(_job_id(watch_id))
    if job:
        job.remove()


def next_run(watch_id: int) -> dt.datetime | None:
    if _scheduler is None:
        return None
    job = _scheduler.get_job(_job_id(watch_id))
    if job and job.next_run_time:
        return job.next_run_time.astimezone(dt.UTC).replace(tzinfo=None)
    return None


def start() -> None:
    global _scheduler
    s = get_settings()
    if not s.scheduler_enabled or _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(
        executors={"default": ThreadPoolExecutor(max_workers=s.max_concurrent_checks)},
        timezone=dt.UTC,
    )
    _scheduler.start()
    with Session(get_engine()) as session:
        watches = session.exec(
            select(FlightWatch)
            .join(Trip)
            .where(FlightWatch.active == True, Trip.archived == False)  # noqa: E712
        ).all()
        now = dt.datetime.now(dt.UTC).replace(tzinfo=None)
        stagger = 0
        scheduled = 0
        for w in watches:
            # One flight with bad data must not stop the app from starting.
            try:
                minutes = _backoff_minutes(w)
                due = (w.last_checked_at + dt.timedelta(minutes=minutes)) if w.last_checked_at else now
                if due <= now:
                    # Overdue flights are spaced out so they don't all run at once.
                    stagger += 20
                    due = now + dt.timedelta(seconds=stagger)
                schedule(w, first_run=due)
                scheduled += 1
            except Exception:  # noqa: BLE001
                log.exception("Voo %s não pôde ser agendado; ignorado", w.id)
    log.info("Agendador iniciado com %d voos", scheduled)


def shutdown() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
