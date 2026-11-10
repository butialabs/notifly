import datetime as dt
from urllib.parse import parse_qs, urlparse

from app.providers.fastflights_provider import build_query
from app.schemas import FlightQuery, Leg, Offer, Slice
from app.services.booking_links import booking_links, google_flights_url

D = dt.date(2027, 3, 10)
R = dt.date(2027, 3, 20)


def q(**kw) -> FlightQuery:
    base = {
        "trip_type": "round_trip",
        "segments": [{"origins": ["GRU", "CGH"], "destinations": ["LIS"], "date": D.isoformat()}],
        "return_date": R.isoformat(),
    }
    return FlightQuery.model_validate({**base, **kw})


def offer(code="TP", stops=0) -> Offer:
    d = dt.datetime.combine(D, dt.time(10))
    leg = Leg(airline_code=code, airline_name="TAP", flight_number="", origin="CGH", destination="LIS",
              departure=d, arrival=d + dt.timedelta(hours=10), duration=600)
    sl = Slice(origin="CGH", destination="LIS", departure=leg.departure, arrival=leg.arrival, duration=600,
               stops=stops, legs=[leg], airlines=["TAP"])
    return Offer(price=1, currency="BRL", duration=600, stops=stops, airlines=["TAP"], slices=[sl])


def by_id(links):
    return {lk["id"]: lk["url"] for lk in links}


def test_google_uses_same_tfs_as_search():
    query = q(cabin="business", passengers={"adults": 2})
    url = google_flights_url(query)
    assert url.startswith("https://www.google.com/travel/flights/search?")
    params = parse_qs(urlparse(url).query)
    assert "q" not in params
    assert params["tfs"] == [build_query(query, "GRU", "LIS", "BRL").params()["tfs"]]
    assert params["curr"] == ["BRL"] and params["hl"] == ["pt-BR"] and params["gl"] == ["BR"]


def test_offer_links_use_offer_route_and_airline():
    query = q(trip_type="one_way")
    links = by_id(booking_links(query, offer()))
    tfs = parse_qs(urlparse(links["google"]).query)["tfs"][0]
    expected = build_query(query, "CGH", "LIS", "BRL", airlines=["TP"], max_stops=0).params()["tfs"]
    assert tfs == expected
    assert links["kayak"] == "https://www.kayak.com.br/flights/CGH-LIS/2027-03-10/1adults?sort=bestflight_a&fs=stops=0;airlines=TP"
    assert links["momondo"].startswith("https://www.momondo.com.br/flight-search/CGH-LIS/2027-03-10/1adults?")
    # accepts the offer as a dict (stored snapshot)
    assert by_id(booking_links(query, offer().model_dump(mode="json"))) == links


def test_round_trip_other_sites():
    query = q(cabin="business", max_stops="nonstop",
              passengers={"adults": 2, "children": 1, "infants_on_lap": 1})
    links = by_id(booking_links(query))
    assert links["kayak"] == (
        "https://www.kayak.com.br/flights/GRU-LIS/2027-03-10/2027-03-20/business/2adults/children-10-1L"
        "?sort=bestflight_a&fs=stops=0"
    )
    assert links["skyscanner"] == (
        "https://www.skyscanner.com.br/transporte/passagens-aereas/gru/lis/270310/270320/"
        "?adultsv2=2&cabinclass=business&rtn=1&childrenv2=10|1&preferdirects=true"
    )
    assert links["decolar"] == "https://www.decolar.com/shop/flights/results/roundtrip/GRU/LIS/2027-03-10/2027-03-20/2/1/1"


def test_round_trip_offer_filters_only_outbound_on_google():
    query = q()
    links = by_id(booking_links(query, offer()))
    assert "fs=" not in links["kayak"]  # offer filters only on one-way trips
    assert len(build_query(query, "CGH", "LIS", "BRL", airlines=["TP"]).flight_data) == 2
