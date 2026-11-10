import datetime as dt

from pydantic import NaiveDatetime
from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC).replace(tzinfo=None)


class Trip(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str | None = None
    emoji: str | None = None
    archived: bool = False
    created_at: NaiveDatetime = Field(default_factory=utcnow)

    watches: list["FlightWatch"] = Relationship(
        back_populates="trip", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class FlightWatch(SQLModel, table=True):
    """A tracked flight (saved search) within a trip."""

    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(foreign_key="trip.id", index=True, ondelete="CASCADE")
    label: str | None = None
    query: dict = Field(sa_column=Column(JSON, nullable=False))
    check_interval_minutes: int = 360
    active: bool = True
    created_at: NaiveDatetime = Field(default_factory=utcnow)

    last_checked_at: NaiveDatetime | None = None
    last_price: float | None = None
    previous_price: float | None = None
    lowest_price: float | None = None
    lowest_price_at: NaiveDatetime | None = None
    highest_price: float | None = None
    currency: str | None = None
    last_error: str | None = None
    consecutive_errors: int = 0

    trip: Trip | None = Relationship(back_populates="watches")
    snapshots: list["PriceSnapshot"] = Relationship(
        back_populates="watch", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class PriceSnapshot(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    watch_id: int = Field(foreign_key="flightwatch.id", index=True, ondelete="CASCADE")
    checked_at: NaiveDatetime = Field(default_factory=utcnow, index=True)
    ok: bool = True
    error: str | None = None
    min_price: float | None = None
    median_price: float | None = None
    currency: str | None = None
    result_count: int = 0
    best_offer: dict | None = Field(default=None, sa_column=Column(JSON(none_as_null=True)))
    offers: list | None = Field(default=None, sa_column=Column(JSON(none_as_null=True)))
    elapsed_ms: int | None = None
    provider: str | None = None

    watch: FlightWatch | None = Relationship(back_populates="snapshots")


class NotificationChannel(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    url: str
    enabled: bool = True
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class RuleChannelLink(SQLModel, table=True):
    rule_id: int = Field(foreign_key="alertrule.id", primary_key=True, ondelete="CASCADE")
    channel_id: int = Field(
        foreign_key="notificationchannel.id", primary_key=True, ondelete="CASCADE"
    )


class AlertRule(SQLModel, table=True):
    """Alert rule. Scope: watch_id (one flight), trip_id (every flight of a trip) or global."""

    id: int | None = Field(default=None, primary_key=True)
    name: str | None = None
    kind: str
    trip_id: int | None = Field(default=None, foreign_key="trip.id", index=True, ondelete="CASCADE")
    watch_id: int | None = Field(
        default=None, foreign_key="flightwatch.id", index=True, ondelete="CASCADE"
    )
    threshold: float | None = None
    min_change_abs: float | None = None
    min_change_pct: float | None = None
    cooldown_minutes: int = 0
    repeat_while_matching: bool = False
    enabled: bool = True
    created_at: NaiveDatetime = Field(default_factory=utcnow)

    channels: list[NotificationChannel] = Relationship(link_model=RuleChannelLink)


class RuleState(SQLModel, table=True):
    """Rule state per flight (armed/disarmed, last fired)."""

    rule_id: int = Field(foreign_key="alertrule.id", primary_key=True, ondelete="CASCADE")
    watch_id: int = Field(foreign_key="flightwatch.id", primary_key=True, ondelete="CASCADE")
    armed: bool = True
    last_triggered_at: NaiveDatetime | None = None


class NotificationLog(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: NaiveDatetime = Field(default_factory=utcnow, index=True)
    rule_id: int | None = Field(default=None, foreign_key="alertrule.id", ondelete="SET NULL")
    channel_id: int | None = Field(
        default=None, foreign_key="notificationchannel.id", ondelete="SET NULL"
    )
    watch_id: int | None = Field(default=None, foreign_key="flightwatch.id", ondelete="SET NULL")
    kind: str | None = None
    title: str
    body: str
    ok: bool
    error: str | None = None
    is_test: bool = False
