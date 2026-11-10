"""Provider based on `fast-flights`, which parses the public Google Flights page.

`app.providers.http` makes the request (proxy, retries, refusal detection); fast-flights
builds the query and parses the HTML. Limits: one airport per origin/destination per
request (we combine up to 4 pairs), no flight numbers, and on round trips only the
outbound legs (the price is the itinerary total).
"""

from __future__ import annotations

import datetime as dt
import itertools
import logging

from fast_flights import FlightQuery as FFQuery
from fast_flights import Passengers as FFPassengers
from fast_flights import create_query
from fast_flights.exceptions import FlightsNotFound
from fast_flights.parser import parse

from app import i18n
from app.config import get_settings
from app.providers.base import FlightProvider, ProviderError
from app.providers.http import Blocked, fetch_html, redact, with_retries
from app.schemas import FlightQuery, Layover, Leg, Offer, Slice, TimeWindow

log = logging.getLogger(__name__)

TRIP = {"one_way": "one-way", "round_trip": "round-trip"}
CABIN = {"economy": "economy", "premium_economy": "premium-economy", "business": "business", "first": "first"}
STOPS = {"any": None, "nonstop": 0, "one": 1, "two": 2}
ALLIANCES = {"STAR_ALLIANCE", "ONEWORLD", "SKYTEAM"}
MAX_PAIRS = 4


def _dt(sd) -> dt.datetime:
    y, m, d = sd.date
    hh, mm = sd.time
    return dt.datetime(y, m, d, hh or 0, mm or 0)


def _ffq(
    origin: str,
    dest: str,
    date: dt.date,
    times: TimeWindow | None,
    q: FlightQuery,
    airlines: list[str] | None = None,
    max_stops: int | None = None,
) -> FFQuery:
    t = times or TimeWindow()
    stops = STOPS[q.max_stops]
    if max_stops is not None:
        stops = max_stops if stops is None else min(stops, max_stops)
    return FFQuery(
        date=date.isoformat(),
        from_airport=origin,
        to_airport=dest,
        max_stops=stops,
        airlines=airlines or [a for a in q.airlines if a.upper() not in ALLIANCES] or None,
        earliest_departure_hour=t.departure_from,
        latest_departure_hour=t.departure_to,
        earliest_arrival_hour=t.arrival_from,
        latest_arrival_hour=t.arrival_to,
        max_duration_minutes=q.max_duration_minutes,
    )


def build_query(
    q: FlightQuery,
    origin: str,
    dest: str,
    currency: str,
    *,
    airlines: list[str] | None = None,
    max_stops: int | None = None,
):
    """fast-flights query (Google's `tfs`). ``airlines``/``max_stops`` only restrict the outbound."""
    out = _ffq(origin, dest, q.segments[0].date, q.segments[0].times, q, airlines, max_stops)
    legs = [out]
    if q.trip_type == "round_trip":
        legs.append(_ffq(dest, origin, q.return_date, q.return_times, q))
    return create_query(
        flights=legs,
        seat=CABIN[q.cabin],
        trip=TRIP[q.trip_type],
        passengers=FFPassengers(**q.passengers.model_dump()),
        language=get_settings().language,
        currency=currency,
        max_price=q.max_price,
        carry_on_bags=int(q.carry_on),
        checked_bags=q.checked_bags,
        exclude_basic_economy=q.exclude_basic_economy,
    )


def _to_offer(f, currency: str) -> Offer:
    legs = [
        Leg(
            airline_code=f.type if f.type != "multi" else "",
            airline_name=f.airlines[0] if f.airlines else "",
            flight_number="",
            origin=s.from_airport.code,
            origin_name=s.from_airport.name,
            destination=s.to_airport.code,
            destination_name=s.to_airport.name,
            departure=_dt(s.departure),
            arrival=_dt(s.arrival),
            duration=s.duration,
            aircraft=s.plane_type or None,
        )
        for s in f.flights
    ]
    layovers = [
        Layover(airport=a.destination, duration=max(int((b.departure - a.arrival).total_seconds() // 60), 0))
        for a, b in zip(legs, legs[1:])
    ]
    total = int((legs[-1].arrival - legs[0].departure).total_seconds() // 60) if legs else 0
    sl = Slice(
        origin=legs[0].origin,
        destination=legs[-1].destination,
        departure=legs[0].departure,
        arrival=legs[-1].arrival,
        duration=max(total, sum(l.duration for l in legs)),
        stops=max(len(legs) - 1, 0),
        legs=legs,
        layovers=layovers,
        airlines=list(f.airlines),
    )
    co2 = getattr(getattr(f, "carbon", None), "emission", None)
    return Offer(
        price=float(f.price) if f.price else None,
        currency=currency,
        duration=sl.duration,
        stops=sl.stops,
        airlines=list(f.airlines),
        slices=[sl],
        co2_g=co2 or None,
    )


class FastFlightsProvider(FlightProvider):
    name = "fast-flights"

    def search(self, query: FlightQuery, currency: str) -> list[Offer]:
        s = get_settings()
        q = query
        pairs = list(itertools.product(q.segments[0].origins, q.segments[0].destinations))[:MAX_PAIRS]
        offers: list[Offer] = []
        blocked: list[str] = []
        errors: list[str] = []
        for origin, dest in pairs:
            params = build_query(q, origin, dest, currency).params()
            try:
                result = with_retries(
                    lambda: parse(fetch_html(params, s.proxy_url)),
                    f"Busca {origin}-{dest}",
                    giveup=(FlightsNotFound,),
                )
            except FlightsNotFound:
                continue
            except Blocked as e:
                log.warning("Google recusou %s-%s: %s", origin, dest, e)
                blocked.append(str(e))
                continue
            except Exception as e:  # noqa: BLE001
                log.warning("Busca %s-%s falhou: %s", origin, dest, redact(e))
                errors.append(redact(e))
                continue
            for f in result:
                try:
                    offers.append(_to_offer(f, currency))
                except Exception as e:  # noqa: BLE001
                    # One malformed flight on the page doesn't fail the whole search.
                    log.warning("Oferta ignorada em %s-%s: %s", origin, dest, e)
        if not offers and blocked:
            raise ProviderError(i18n.t("provider.blocked", reason=blocked[-1]))
        if not offers and errors:
            raise ProviderError(i18n.t("provider.failed", error=errors[0][:200]))
        exclude = {a.upper() for a in q.airlines_exclude}
        if exclude:
            offers = [o for o in offers if not any(l.airline_code in exclude for sl in o.slices for l in sl.legs)]
        if q.sort == "cheapest" or len(pairs) > 1:
            offers.sort(key=lambda o: o.price if o.price is not None else float("inf"))
        return offers


_provider: FlightProvider | None = None


def get_provider() -> FlightProvider:
    global _provider
    if _provider is None:
        _provider = FastFlightsProvider()
    return _provider


def set_provider(p: FlightProvider) -> None:
    global _provider
    _provider = p
