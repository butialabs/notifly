"""Links that open the search (or one offer) on booking sites.

Google Flights gets the same `tfs` protobuf the app searches with, so the link opens the
exact same search. The other sites get route, dates, passengers and cabin in their own
URL format.
"""

from __future__ import annotations

import datetime as dt
from urllib.parse import quote, urlencode

from app.config import get_settings
from app.providers.fastflights_provider import build_query
from app.schemas import FlightQuery, Offer

KAYAK_CABIN = {"premium_economy": "premium", "business": "business", "first": "first"}
SKY_CABIN = {"economy": "economy", "premium_economy": "premiumeconomy", "business": "business", "first": "first"}
CHILD_AGE = 10


def _route(q: FlightQuery, offer: Offer | dict | None) -> tuple[str, str, list[str] | None, int | None]:
    """Origin, destination, airline (if only one) and stops of the offer; without one, the first pair of the search."""
    s0 = q.segments[0]
    origin, dest = s0.origins[0], s0.destinations[0]
    if offer is None:
        return origin, dest, None, None
    o = offer if isinstance(offer, dict) else offer.model_dump(mode="json")
    slices = o.get("slices") or []
    if not slices:
        return origin, dest, None, None
    sl = slices[0]
    codes = {leg.get("airline_code") for leg in sl.get("legs") or []}
    airline = [codes.pop()] if len(codes) == 1 and next(iter(codes)) else None
    stops = sl.get("stops")
    return (
        sl.get("origin") or origin,
        sl.get("destination") or dest,
        airline,
        stops if isinstance(stops, int) and stops <= 2 else None,
    )


def google_flights_url(
    q: FlightQuery,
    origin: str | None = None,
    dest: str | None = None,
    airlines: list[str] | None = None,
    max_stops: int | None = None,
) -> str:
    s = get_settings()
    s0 = q.segments[0]
    query = build_query(
        q, origin or s0.origins[0], dest or s0.destinations[0], s.currency, airlines=airlines, max_stops=max_stops
    )
    return "https://www.google.com/travel/flights/search?" + urlencode({**query.params(), "gl": s.country})


def _dates(q: FlightQuery) -> list[dt.date]:
    return [q.segments[0].date] + ([q.return_date] if q.trip_type == "round_trip" else [])


def _kayak_path(q: FlightQuery, origin: str, dest: str) -> str:
    p = q.passengers
    parts = [f"{origin}-{dest}", *(d.isoformat() for d in _dates(q))]
    if q.cabin in KAYAK_CABIN:  # cabin must come before passengers or Kayak ignores it
        parts.append(KAYAK_CABIN[q.cabin])
    parts.append(f"{max(p.adults, 1)}adults")
    kids = [str(CHILD_AGE)] * p.children + ["1S"] * p.infants_in_seat + ["1L"] * p.infants_on_lap
    if kids:
        parts.append("children-" + "-".join(kids))
    return "/".join(quote(x) for x in parts)


def _kayak_filters(q: FlightQuery, airline: list[str] | None, stops: int | None) -> str:
    """Kayak/Momondo `fs` filters. Offer filters only apply to one-way trips (on Kayak they cover the whole trip)."""
    limit = {"nonstop": 0, "one": 1}.get(q.max_stops)
    if q.trip_type == "one_way" and stops is not None:
        limit = stops if limit is None else min(limit, stops)
    fs = []
    if limit == 0:
        fs.append("stops=0")
    elif limit == 1:
        fs.append("stops=-2")
    codes = airline if q.trip_type == "one_way" and airline else [a for a in q.airlines if len(a) == 2]
    if codes:
        fs.append("airlines=" + ",".join(codes))
    return ";".join(fs)


def kayak_url(q: FlightQuery, origin: str, dest: str, airline=None, stops=None, *, momondo: bool = False) -> str:
    br = get_settings().country.upper() == "BR"
    host = ("www.momondo.com.br" if br else "www.momondo.com") if momondo else ("www.kayak.com.br" if br else "www.kayak.com")
    section = "flight-search" if momondo else "flights"
    params = {"sort": "bestflight_a"}
    if fs := _kayak_filters(q, airline, stops):
        params["fs"] = fs
    return f"https://{host}/{section}/{_kayak_path(q, origin, dest)}?{urlencode(params, safe='=;,-')}"


def skyscanner_url(q: FlightQuery, origin: str, dest: str) -> str:
    br = get_settings().country.upper() == "BR"
    base = (
        "https://www.skyscanner.com.br/transporte/passagens-aereas"
        if br
        else "https://www.skyscanner.net/transport/flights"
    )
    dates = "/".join(d.strftime("%y%m%d") for d in _dates(q))
    p = q.passengers
    ages = [str(CHILD_AGE)] * p.children + ["1"] * (p.infants_in_seat + p.infants_on_lap)
    params = {
        "adultsv2": max(p.adults, 1),
        "cabinclass": SKY_CABIN[q.cabin],
        "rtn": int(q.trip_type == "round_trip"),
    }
    if ages:
        params["childrenv2"] = "|".join(ages)
    if q.max_stops == "nonstop":
        params["preferdirects"] = "true"
    return f"{base}/{origin.lower()}/{dest.lower()}/{dates}/?{urlencode(params, safe='|')}"


def decolar_url(q: FlightQuery, origin: str, dest: str) -> str:
    p = q.passengers
    kind = "roundtrip" if q.trip_type == "round_trip" else "oneway"
    dates = "/".join(d.isoformat() for d in _dates(q))
    pax = f"{max(p.adults, 1)}/{p.children + p.infants_in_seat}/{p.infants_on_lap}"
    return f"https://www.decolar.com/shop/flights/results/{kind}/{origin}/{dest}/{dates}/{pax}"


def booking_links(q: FlightQuery, offer: Offer | dict | None = None) -> list[dict]:
    """Links for the search (no ``offer``) or for one offer, in display order."""
    origin, dest, airline, stops = _route(q, offer)
    links = [
        {"id": "google", "name": "Google Flights", "url": google_flights_url(q, origin, dest, airline, stops)},
        {"id": "kayak", "name": "Kayak", "url": kayak_url(q, origin, dest, airline, stops)},
        {"id": "skyscanner", "name": "Skyscanner", "url": skyscanner_url(q, origin, dest)},
        {"id": "momondo", "name": "Momondo", "url": kayak_url(q, origin, dest, airline, stops, momondo=True)},
    ]
    if get_settings().country.upper() == "BR":
        links.append({"id": "decolar", "name": "Decolar", "url": decolar_url(q, origin, dest)})
    return links


def with_offer_links(q: FlightQuery, offers: list | None) -> list:
    """Copy of the offers (dicts or `Offer`) with `links` filled in; none of it is stored."""
    out = []
    for o in offers or []:
        d = o if isinstance(o, dict) else o.model_dump(mode="json")
        out.append({**d, "links": booking_links(q, d)})
    return out
