import datetime as dt

D = (dt.date.today() + dt.timedelta(days=60)).isoformat()
R = (dt.date.today() + dt.timedelta(days=70)).isoformat()
QUERY = {
    "trip_type": "round_trip",
    "segments": [{"origins": ["GRU"], "destinations": ["LIS"], "date": D}],
    "return_date": R,
}


def test_search(client):
    r = client.post("/api/search", json=QUERY)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["min_price"] == 1000 and body["count"] == 2
    assert body["google_flights_url"].startswith("https://www.google.com/travel/flights/search?tfs=")
    assert [lk["id"] for lk in body["links"]][:3] == ["google", "kayak", "skyscanner"]
    assert body["offers"][0]["links"][0]["url"].startswith("https://www.google.com/travel/flights/search?tfs=")
    assert client.get("/api/airports", params={"q": "LIS"}).json()[0]["code"] == "LIS"


def test_full_flow(client, provider, sent):
    trip = client.post("/api/trips", json={"name": "Lisboa 2027"}).json()
    w = client.post(f"/api/trips/{trip['id']}/watches", json={"query": QUERY, "check_interval_minutes": 60}).json()
    ch = client.post("/api/channels", json={"name": "ntfy", "url": "ntfy://meu-topico"}).json()
    assert client.post("/api/channels", json={"name": "x", "url": "nada://"}).status_code == 400
    client.post("/api/rules", json={"kind": "price_drop", "watch_id": w["id"], "channel_ids": [ch["id"]]})
    client.post("/api/rules", json={"kind": "below_threshold", "trip_id": trip["id"], "threshold": 800})
    client.post("/api/rules", json={"kind": "price_rise", "trip_id": trip["id"]})
    assert len(client.get("/api/rules", params={"trip_id": trip["id"]}).json()) == 2
    assert len(client.get("/api/rules", params={"watch_id": w["id"]}).json()) == 1

    provider.prices = [1000, 900, 700, 750, 650]
    r = client.post(f"/api/watches/{w['id']}/check").json()
    assert r["watch"]["last_price"] == 1000 and not sent  # nothing to compare on the first check

    client.post(f"/api/watches/{w['id']}/check")  # 900: drop
    assert len(sent) == 1 and "caiu" in sent[0][1]
    client.post(f"/api/watches/{w['id']}/check")  # 700: drop + below 800
    assert len(sent) == 3
    client.post(f"/api/watches/{w['id']}/check")  # 750: rise (rule without channels = all)
    assert len(sent) == 4 and "subiu" in sent[3][1]
    client.post(f"/api/watches/{w['id']}/check")  # 650: drop; threshold stays disarmed
    assert len(sent) == 5

    watch = client.get(f"/api/watches/{w['id']}").json()
    assert watch["lowest_price"] == 650 and watch["highest_price"] == 1000
    assert len(watch["sparkline"]) == 5
    assert len(client.get(f"/api/watches/{w['id']}/history").json()) == 5
    latest = client.get(f"/api/watches/{w['id']}/latest").json()
    assert latest["best_offer"]["price"] == 650
    assert "kayak.com.br/flights/GRU-LIS/" in latest["offers"][0]["links"][1]["url"]
    assert len(client.get("/api/notifications").json()) == 5

    trips = client.get("/api/trips").json()
    assert trips[0]["best_price"] == 650 and trips[0]["watch_count"] == 1
    detail = client.get(f"/api/trips/{trip['id']}").json()
    assert detail["watches"][0]["route"] == "GRU ⇄ LIS"

    client.delete(f"/api/trips/{trip['id']}")
    assert client.get(f"/api/watches/{w['id']}").status_code == 404


def test_validation(client):
    bad = {**QUERY, "return_date": None}
    assert client.post("/api/search", json=bad).status_code == 422


def test_watch_detail_extras(client, provider, sent):
    trip = client.post("/api/trips", json={"name": "X"}).json()
    w = client.post(f"/api/trips/{trip['id']}/watches", json={"query": QUERY}).json()
    client.post("/api/rules", json={"kind": "below_threshold", "trip_id": trip["id"], "threshold": 2000})
    client.post(f"/api/watches/{w['id']}/check")
    d = client.get(f"/api/watches/{w['id']}").json()
    assert d["last_provider"] == "fake"
    assert d["applicable_rules"][0]["scope"] == "trip" and d["applicable_rules"][0]["threshold"] == 2000
    assert d["last_alert"]["kind"] == "below_threshold"


def test_manual_check_cooldown(client, provider, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "manual_check_cooldown_seconds", 120)
    trip = client.post("/api/trips", json={"name": "Y"}).json()
    w = client.post(f"/api/trips/{trip['id']}/watches", json={"query": QUERY}).json()
    assert client.post(f"/api/watches/{w['id']}/check").status_code == 200
    r = client.post(f"/api/watches/{w['id']}/check")
    assert r.status_code == 429 and "Calma" in r.json()["detail"]


def test_trip_default_emoji_and_segment_limit(client):
    t = client.post("/api/trips", json={"name": "Sem emoji"}).json()
    assert t["emoji"] == "✈️"
    t2 = client.post("/api/trips", json={"name": "Com", "emoji": "🏝️"}).json()
    assert t2["emoji"] == "🏝️"
    many = {**QUERY, "segments": [{"origins": ["GRU", "CGH", "VCP", "GIG", "SDU", "BSB", "CNF"], "destinations": ["LIS"], "date": D}]}
    assert client.post("/api/search", json=many).status_code == 422


def test_trip_watches_sorted_by_date(client):
    trip = client.post("/api/trips", json={"name": "Europa"}).json()
    base = dt.date.today() + dt.timedelta(days=40)

    def one_way(o, d, days):
        date = (base + dt.timedelta(days=days)).isoformat()
        return {"trip_type": "one_way", "segments": [{"origins": [o], "destinations": [d], "date": date}]}

    # created out of order
    for q in (one_way("MAD", "GRU", 14), one_way("GRU", "LIS", 0), one_way("LIS", "MAD", 7)):
        client.post(f"/api/trips/{trip['id']}/watches", json={"query": q})
    routes = [w["route"] for w in client.get(f"/api/trips/{trip['id']}").json()["watches"]]
    assert routes == ["GRU → LIS", "LIS → MAD", "MAD → GRU"]
    listed = next(t for t in client.get("/api/trips").json() if t["id"] == trip["id"])
    assert [p["route"] for p in listed["watch_prices"]] == routes


def test_multi_city_rejected(client):
    q = {**QUERY, "trip_type": "multi_city", "return_date": None}
    assert client.post("/api/search", json=q).status_code == 422


def test_migrate_splits_multi_city():
    import json

    from sqlalchemy import text

    from app import db

    engine = db.make_engine("sqlite://")
    db.set_engine(engine)
    db.init_db()
    segs = [
        {"origins": ["GRU"], "destinations": ["LIS"], "date": D},
        {"origins": ["MAD"], "destinations": ["GRU"], "date": R},
    ]
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO trip (name, archived, created_at) VALUES ('T', 0, CURRENT_TIMESTAMP)"))
        conn.execute(
            text(
                "INSERT INTO flightwatch (trip_id, query, check_interval_minutes, active, created_at, "
                "consecutive_errors, last_price) VALUES (1, :q, 60, 1, CURRENT_TIMESTAMP, 0, 5000)"
            ),
            {"q": json.dumps({"trip_type": "multi_city", "segments": segs})},
        )
    db.init_db()
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT id, trip_id, query, last_price FROM flightwatch ORDER BY id")).fetchall()
    assert [(r[1], json.loads(r[2])["trip_type"], json.loads(r[2])["segments"]) for r in rows] == [
        (1, "one_way", [segs[0]]),
        (1, "one_way", [segs[1]]),
    ]
    assert rows[0][3] is None


def test_place_resolve(client):
    gru = client.get("/api/places/resolve", params={"codes": "GRU"}).json()
    assert gru["type"] == "airport" and gru["code"] == "GRU" and gru["city"]
    sp = client.get("/api/airports", params={"q": "São Paulo"}).json()[0]
    assert sp["type"] == "city"
    back = client.get("/api/places/resolve", params={"codes": ",".join(reversed(sp["codes"]))}).json()
    assert back["type"] == "city" and back["city"] == sp["city"]
    part = client.get("/api/places/resolve", params={"codes": ",".join(sp["codes"][:2])}).json()
    assert part["codes"] == sp["codes"][:2] and part["city"] == sp["city"]
    assert client.get("/api/places/resolve", params={"codes": "XXX"}).json() is None


def test_edit_channel(client):
    ch = client.post("/api/channels", json={"name": "Email", "url": "json://localhost/a"}).json()
    r = client.patch(f"/api/channels/{ch['id']}", json={"name": "Email novo", "url": "json://localhost/b"})
    assert r.status_code == 200 and r.json()["name"] == "Email novo" and "url" not in r.json()
    assert r.json()["url_masked"].startswith("json://")
    assert client.patch(f"/api/channels/{ch['id']}", json={"url": "naoexiste://x"}).status_code == 400
    from sqlmodel import Session

    from app import db
    from app.models import NotificationChannel

    with Session(db.get_engine()) as s:
        assert s.get(NotificationChannel, ch["id"]).url == "json://localhost/b"
