"""API input/output schemas and the search domain."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app import i18n

TripType = Literal["one_way", "round_trip"]
Cabin = Literal["economy", "premium_economy", "business", "first"]
Stops = Literal["any", "nonstop", "one", "two"]
SortMode = Literal["best", "cheapest", "departure", "arrival", "duration"]
Alliance = Literal["ONEWORLD", "SKYTEAM", "STAR_ALLIANCE"]
RuleKind = Literal[
    "price_drop",
    "price_rise",
    "price_change",
    "below_threshold",
    "above_threshold",
    "new_lowest",
]


# --------------------------------------------------------------------------- search
class Passengers(BaseModel):
    adults: int = Field(1, ge=0, le=9)
    children: int = Field(0, ge=0, le=9)
    infants_in_seat: int = Field(0, ge=0, le=9)
    infants_on_lap: int = Field(0, ge=0, le=9)

    @model_validator(mode="after")
    def _check(self):
        if self.adults + self.children + self.infants_in_seat + self.infants_on_lap == 0:
            raise ValueError(i18n.t("val.no_passenger"))
        if self.infants_on_lap > self.adults:
            raise ValueError(i18n.t("val.lap_infant"))
        return self


class TimeWindow(BaseModel):
    """Local hours (0-24)."""

    departure_from: int | None = Field(None, ge=0, le=23)
    departure_to: int | None = Field(None, ge=1, le=24)
    arrival_from: int | None = Field(None, ge=0, le=23)
    arrival_to: int | None = Field(None, ge=1, le=24)

    def is_empty(self) -> bool:
        return all(v is None for v in self.model_dump().values())


class Segment(BaseModel):
    origins: list[str] = Field(min_length=1)
    destinations: list[str] = Field(min_length=1)
    date: dt.date
    times: TimeWindow | None = None

    @field_validator("origins", "destinations")
    @classmethod
    def _upper(cls, v: list[str]) -> list[str]:
        out = []
        for code in v:
            code = code.strip().upper()
            if code and code not in out:
                out.append(code)
        if not out:
            raise ValueError(i18n.t("val.no_airport"))
        if len(out) > 6:
            raise ValueError(i18n.t("val.too_many_airports"))
        return out


class FlightQuery(BaseModel):
    trip_type: TripType = "round_trip"
    segments: list[Segment] = Field(min_length=1, max_length=6)
    return_date: dt.date | None = None
    return_times: TimeWindow | None = None
    passengers: Passengers = Passengers()
    cabin: Cabin = "economy"
    max_stops: Stops = "any"
    airlines: list[str] = []
    airlines_exclude: list[str] = []
    alliances: list[Alliance] = []
    max_duration_minutes: int | None = Field(None, gt=0)
    max_price: int | None = Field(None, gt=0)
    checked_bags: int = Field(0, ge=0, le=2)
    carry_on: bool = False
    exclude_basic_economy: bool = False
    sort: SortMode = "best"

    @model_validator(mode="after")
    def _check(self):
        if self.trip_type == "round_trip":
            if self.return_date is None:
                raise ValueError(i18n.t("val.return_required"))
            if self.return_date < self.segments[0].date:
                raise ValueError(i18n.t("val.return_before"))
            self.segments = self.segments[:1]
        else:
            self.segments = self.segments[:1]
            self.return_date = None
        return self

    @property
    def first_date(self) -> dt.date:
        return self.segments[0].date

    @property
    def last_date(self) -> dt.date:
        return self.return_date or self.segments[-1].date

    def route_label(self) -> str:
        s0 = self.segments[0]
        o, d = "/".join(s0.origins), "/".join(s0.destinations)
        if self.trip_type == "round_trip":
            return f"{o} ⇄ {d}"
        return f"{o} → {d}"


class Leg(BaseModel):
    airline_code: str
    airline_name: str
    flight_number: str
    origin: str
    origin_name: str | None = None
    destination: str
    destination_name: str | None = None
    departure: dt.datetime
    arrival: dt.datetime
    duration: int
    aircraft: str | None = None
    legroom: str | None = None
    overnight: bool = False


class Layover(BaseModel):
    airport: str
    city: str | None = None
    duration: int
    overnight: bool = False
    change_of_airport: bool = False


class Slice(BaseModel):
    """One direction of the trip (outbound or return)."""

    origin: str
    destination: str
    departure: dt.datetime
    arrival: dt.datetime
    duration: int
    stops: int
    legs: list[Leg]
    layovers: list[Layover] = []
    airlines: list[str] = []


class Offer(BaseModel):
    price: float | None
    currency: str | None
    duration: int  # sum of the legs
    stops: int  # most stops across the slices
    airlines: list[str]
    slices: list[Slice]
    co2_g: int | None = None
    emissions_tag: str | None = None
    # Booking links, built in the API response and never stored.
    links: list[dict] = []


class SearchResult(BaseModel):
    offers: list[Offer]
    min_price: float | None
    median_price: float | None
    currency: str | None
    count: int
    google_flights_url: str
    links: list[dict] = []
    elapsed_ms: int
    provider: str | None = None


# --------------------------------------------------------------------------- CRUD
class TripIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    emoji: str | None = Field(None, max_length=8)
    archived: bool = False


MAX_INTERVAL_MINUTES = 43200  # 30 days; larger values overflow the scheduler
MAX_COOLDOWN_MINUTES = 525600  # 1 year


def _not_null(v):
    # Omitted field = unchanged; an explicit null on a NOT NULL column is a 422, not a 500.
    if v is None:
        raise ValueError(i18n.t("val.not_null"))
    return v


class TripPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = None
    emoji: str | None = Field(None, max_length=8)
    archived: bool | None = None

    _name_not_null = field_validator("name", "archived", mode="before")(_not_null)


class WatchIn(BaseModel):
    label: str | None = Field(None, max_length=120)
    query: FlightQuery
    check_interval_minutes: int | None = Field(None, ge=0, le=MAX_INTERVAL_MINUTES)
    active: bool = True


class WatchPatch(BaseModel):
    label: str | None = Field(None, max_length=120)
    query: FlightQuery | None = None
    check_interval_minutes: int | None = Field(None, ge=0, le=MAX_INTERVAL_MINUTES)
    active: bool | None = None
    trip_id: int | None = None


class ChannelIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=3, max_length=2000)
    enabled: bool = True


class ChannelPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    url: str | None = Field(None, min_length=3, max_length=2000)
    enabled: bool | None = None

    _not_null = field_validator("name", "url", "enabled", mode="before")(_not_null)


class RuleIn(BaseModel):
    name: str | None = Field(None, max_length=120)
    kind: RuleKind
    trip_id: int | None = None
    watch_id: int | None = None
    threshold: float | None = Field(None, gt=0)
    min_change_abs: float | None = Field(None, ge=0)
    min_change_pct: float | None = Field(None, ge=0)
    cooldown_minutes: int = Field(0, ge=0, le=MAX_COOLDOWN_MINUTES)
    repeat_while_matching: bool = False
    enabled: bool = True
    channel_ids: list[int] = Field([], max_length=50)

    @model_validator(mode="after")
    def _check(self):
        if self.kind in ("below_threshold", "above_threshold") and self.threshold is None:
            raise ValueError(i18n.t("rule.threshold_required"))
        return self


class RulePatch(BaseModel):
    name: str | None = Field(None, max_length=120)
    kind: RuleKind | None = None
    threshold: float | None = Field(None, gt=0)
    min_change_abs: float | None = Field(None, ge=0)
    min_change_pct: float | None = Field(None, ge=0)
    cooldown_minutes: int | None = Field(None, ge=0, le=MAX_COOLDOWN_MINUTES)
    repeat_while_matching: bool | None = None
    enabled: bool | None = None
    channel_ids: list[int] | None = Field(None, max_length=50)
