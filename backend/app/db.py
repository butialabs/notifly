import os
from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = make_engine(get_settings().db_url)
    return _engine


def make_engine(url: str):
    kwargs = {"connect_args": {"check_same_thread": False}}
    if url == "sqlite://":
        from sqlalchemy.pool import StaticPool

        kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()

    return engine


def set_engine(engine) -> None:
    global _engine
    _engine = engine


def init_db() -> None:
    from app import models  # noqa: F401

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _migrate(engine)
    _restrict_db_files(engine)


def _restrict_db_files(engine) -> None:
    """The database holds channel URLs (tokens, passwords): 0600, also on old installs."""
    db = engine.url.database
    if not db or db == ":memory:":
        return
    for suffix in ("", "-wal", "-shm"):
        try:
            os.chmod(f"{db}{suffix}", 0o600)
        except OSError:
            pass


# Simple additive migrations (SQLite): column -> DDL
_ADDED_COLUMNS = {
    "pricesnapshot": {"provider": "VARCHAR"},
}


def _migrate(engine) -> None:
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in _ADDED_COLUMNS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for col, ddl in cols.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
        # Trip stamp: default to ✈️, and replace flags (Windows renders them as letters).
        if insp.has_table("trip"):
            rows = conn.execute(text("SELECT id, emoji FROM trip")).fetchall()
            for trip_id, emoji in rows:
                if not emoji or not emoji.strip() or _is_flag(emoji):
                    conn.execute(text("UPDATE trip SET emoji = :e WHERE id = :i"), {"e": "✈️", "i": trip_id})
        if insp.has_table("flightwatch"):
            _split_multi_city(conn)


def _split_multi_city(conn) -> None:
    """Multi-city was removed: each leg becomes a one-way flight in the same trip.

    The original flight keeps the first leg and its history. Its aggregate prices are
    cleared because they were the whole itinerary's total.
    """
    import json

    from sqlalchemy import text

    rows = conn.execute(
        text("SELECT id, trip_id, label, query, check_interval_minutes, active FROM flightwatch")
    ).fetchall()
    for wid, trip_id, label, raw, interval, active in rows:
        q = json.loads(raw) if isinstance(raw, str) else raw
        if q.get("trip_type") != "multi_city":
            continue
        segs = q.get("segments") or []
        for i, seg in enumerate(segs):
            nq = json.dumps({**q, "trip_type": "one_way", "segments": [seg], "return_date": None})
            if i == 0:
                conn.execute(
                    text(
                        "UPDATE flightwatch SET query = :q, last_price = NULL, previous_price = NULL, "
                        "lowest_price = NULL, lowest_price_at = NULL, highest_price = NULL WHERE id = :i"
                    ),
                    {"q": nq, "i": wid},
                )
            else:
                conn.execute(
                    text(
                        "INSERT INTO flightwatch (trip_id, label, query, check_interval_minutes, active, "
                        "created_at, consecutive_errors) VALUES (:t, :l, :q, :c, :a, CURRENT_TIMESTAMP, 0)"
                    ),
                    {"t": trip_id, "l": label, "q": nq, "c": interval, "a": active},
                )


def _is_flag(s: str) -> bool:
    return any(0x1F1E6 <= ord(c) <= 0x1F1FF for c in s)


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
