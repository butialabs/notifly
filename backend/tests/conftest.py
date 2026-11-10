import datetime as dt
import os

os.environ["NOTIFLY_SCHEDULER_ENABLED"] = "false"
os.environ["NOTIFLY_MIN_SECONDS_BETWEEN_SEARCHES"] = "0"
os.environ["NOTIFLY_MANUAL_CHECK_COOLDOWN_SECONDS"] = "0"
os.environ["NOTIFLY_DATA_DIR"] = "/tmp/notifly-test"
os.environ["NOTIFLY_ALLOWED_HOSTS"] = "testserver"  # TestClient's default host

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.providers import fastflights_provider  # noqa: E402
from app.providers.base import FlightProvider  # noqa: E402
from app.schemas import Leg, Offer, Slice  # noqa: E402
from app.services import notifier, search  # noqa: E402


class FakeProvider(FlightProvider):
    name = "fake"

    def __init__(self):
        self.prices = [1000.0]
        self.calls = 0

    def search(self, query, currency):
        price = self.prices[min(self.calls, len(self.prices) - 1)]
        self.calls += 1
        d = dt.datetime.combine(query.first_date, dt.time(10))
        leg = Leg(
            airline_code="G3", airline_name="Gol", flight_number="1", origin="GRU",
            destination="LIS", departure=d, arrival=d + dt.timedelta(hours=10), duration=600,
        )
        sl = Slice(
            origin="GRU", destination="LIS", departure=leg.departure, arrival=leg.arrival,
            duration=600, stops=0, legs=[leg], airlines=["Gol"],
        )
        return [
            Offer(price=price, currency=currency, duration=600, stops=0, airlines=["Gol"], slices=[sl]),
            Offer(price=price + 500, currency=currency, duration=700, stops=1, airlines=["TAP"], slices=[sl]),
        ]


@pytest.fixture
def provider():
    p = FakeProvider()
    fastflights_provider.set_provider(p)
    search._cache.clear()
    yield p


@pytest.fixture
def sent(monkeypatch):
    out = []

    def fake_send(url, title, body):
        out.append((url, title, body))
        return notifier.SendResult(True)

    monkeypatch.setattr(notifier, "send", fake_send)
    return out


@pytest.fixture
def client(provider):
    db.set_engine(db.make_engine("sqlite://"))
    from app.main import app

    with TestClient(app) as c:
        yield c
