import datetime as dt
from types import SimpleNamespace

import pytest

from app.airports.index import airline_name, search_airlines, search_places
from app.providers import fastflights_provider as ffp
from app.providers import http
from app.providers.base import ProviderError
from app.schemas import FlightQuery

D = dt.date.today() + dt.timedelta(days=60)
OK_HTML = '<html><script class="ds:1" nonce="x">AF_initDataCallback({data:[]});</script></html>'


def q(**kw):
    base = dict(
        trip_type="round_trip",
        segments=[{"origins": ["gru", "CGH"], "destinations": ["LIS"], "date": D}],
        return_date=D + dt.timedelta(days=10),
    )
    base.update(kw)
    return FlightQuery.model_validate(base)


def test_places():
    r = search_places("sao paulo")
    assert r[0]["type"] == "city" and set(r[0]["codes"]) >= {"GRU", "CGH"}
    assert search_places("GRU")[0]["code"] == "GRU"
    assert any(x["code"] == "LIS" for x in search_places("lisbo"))
    assert search_airlines("gol")[0]["code"] == "G3"
    assert airline_name("2Z") == airline_name("_2Z") != "2Z"


# ------------------------------------------------------------------ http


@pytest.fixture
def proxy(monkeypatch):
    """Toggle the proxy in settings and zero the retry delay."""
    from app.config import get_settings

    monkeypatch.setattr(http, "RETRY_DELAY", 0)

    def set_(url):
        monkeypatch.setattr(get_settings(), "proxy_url", url)

    set_(None)
    return set_


def _counter(results):
    calls = []

    def fn():
        calls.append(1)
        item = results[min(len(calls), len(results)) - 1]
        if isinstance(item, BaseException):
            raise item
        return item

    return fn, calls


def test_three_attempts_with_proxy(proxy):
    proxy("http://u:p@proxy:8080")
    fn, calls = _counter([http.Blocked("a"), http.Blocked("b"), "ok"])
    assert http.with_retries(fn, "t") == "ok" and len(calls) == 3
    fn, calls = _counter([http.Blocked("x")] * 5)
    with pytest.raises(http.Blocked):
        http.with_retries(fn, "t")
    assert len(calls) == 3


def test_single_attempt_without_proxy(proxy):
    fn, calls = _counter([RuntimeError("timeout"), "ok"])
    with pytest.raises(RuntimeError):
        http.with_retries(fn, "t")
    assert len(calls) == 1


def test_giveup_not_retried(proxy):
    proxy("http://u:p@proxy:8080")
    fn, calls = _counter([KeyError("x")])
    with pytest.raises(KeyError):
        http.with_retries(fn, "t", giveup=(KeyError,))
    assert len(calls) == 1


@pytest.mark.parametrize(
    "status,url,html,reason",
    [
        (429, "https://www.google.com/travel/flights", OK_HTML, "429"),
        (200, "https://www.google.com/sorry/index?continue=x", "<html/>", "anti-robô"),
        (200, "https://consent.google.com/ml?continue=x", "<html/>", "consentimento"),
        (503, "https://www.google.com/travel/flights", "", "503"),
        (200, "https://www.google.com/travel/flights", "<html>nada</html>", "sem dados"),
    ],
)
def test_check_page_blocked(status, url, html, reason):
    with pytest.raises(http.Blocked, match=reason):
        http.check_page(status, url, html)


def test_check_page_ok():
    http.check_page(200, "https://www.google.com/travel/flights?tfs=x", OK_HTML)


def test_redact():
    assert http.redact("falhou via http://user:s3nha@proxy:8080/x") == "falhou via http://***@proxy:8080/x"


class FakeResp:
    def __init__(self, status=200, url="https://www.google.com/travel/flights", text=OK_HTML):
        self.status_code, self.url, self.text = status, url, text


def test_fetch_new_client_per_attempt(monkeypatch, proxy):
    proxy("http://u:p@proxy:8080")
    made, script = [], [FakeResp(429), FakeResp(200, "https://www.google.com/sorry/x", ""), FakeResp()]

    class FakeClient:
        def __init__(self, proxy):
            made.append(proxy)

        def get(self, url, params):
            return script.pop(0)

    monkeypatch.setattr(http, "_client", FakeClient)
    assert http.with_retries(lambda: http.fetch_html({"tfs": "x"}, "http://u:p@proxy:8080"), "t") == OK_HTML
    assert made == ["http://u:p@proxy:8080"] * 3


# ------------------------------------------------------------------ provider


def test_provider_blocked_is_error_not_empty(monkeypatch, proxy):
    def boom(params, proxy):
        raise http.Blocked("limite de requisições (HTTP 429)")

    monkeypatch.setattr(ffp, "fetch_html", boom)
    with pytest.raises(ProviderError, match="recusou.*429"):
        ffp.FastFlightsProvider().search(q(trip_type="one_way", return_date=None), "BRL")


def test_provider_not_found_is_empty(monkeypatch, proxy):
    from fast_flights.exceptions import FlightsNotFound

    def parse(html):
        raise FlightsNotFound("none")

    monkeypatch.setattr(ffp, "fetch_html", lambda params, proxy: OK_HTML)
    monkeypatch.setattr(ffp, "parse", parse)
    assert ffp.FastFlightsProvider().search(q(), "BRL") == []


def test_provider_partial_block_returns_offers(monkeypatch, proxy):
    """One pair blocked, one with flights: returns the offers that came back."""
    seen = []

    def fetch(params, proxy):
        seen.append(params)
        if len(seen) == 1:
            raise http.Blocked("HTTP 503")
        return OK_HTML

    monkeypatch.setattr(ffp, "fetch_html", fetch)
    monkeypatch.setattr(ffp, "parse", lambda html: ["f"])
    offer = SimpleNamespace(price=100.0, slices=[])
    monkeypatch.setattr(ffp, "_to_offer", lambda f, cur: offer)
    assert ffp.FastFlightsProvider().search(q(), "BRL") == [offer]
    assert len(seen) == 2 and all("tfs" in p for p in seen)
