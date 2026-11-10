import datetime as dt

D = (dt.date.today() + dt.timedelta(days=60)).isoformat()
QUERY = {"trip_type": "one_way", "segments": [{"origins": ["GRU"], "destinations": ["LIS"], "date": D}]}
EVIL = {"origin": "https://evil.example"}


def _trip(client):
    return client.post("/api/trips", json={"name": "Viagem"}).json()


# ------------------------------------------------------------------ Host / DNS rebinding
def test_unknown_host_rejected(client):
    r = client.get("/api/channels", headers={"host": "rebind.attacker.example:8021"})
    assert r.status_code == 400 and "NOTIFLY_ALLOWED_HOSTS" in r.json()["detail"]
    assert client.get("/api/channels").status_code == 200


def test_allowed_hosts_default_and_wildcard():
    from app.config import Settings

    s = Settings(allowed_hosts="", public_url="https://Fare.Example.com/app")
    assert s.allowed_host_set == {"localhost", "127.0.0.1", "::1", "fare.example.com"}
    assert Settings(allowed_hosts="*").allowed_host_set is None
    assert Settings(allowed_hosts="a.com, B.com").allowed_host_set == {"a.com", "b.com"}


# ------------------------------------------------------------------ CSRF
def test_cross_site_mutations_rejected(client):
    body = b'{"name":"x","url":"json://dummy.invalid/hook"}'
    # "simple" POST without Content-Type (what another site can send without preflight)
    r = client.post("/api/channels", content=body, headers={"content-type": ""})
    assert r.status_code == 415
    assert client.post("/api/channels", content=body, headers={"content-type": "text/plain"}).status_code == 415
    ch = client.post("/api/channels", json={"name": "x", "url": "json://dummy.invalid/hook"}).json()
    # bodiless POSTs from another origin or site
    assert client.post(f"/api/channels/{ch['id']}/test", headers=EVIL).status_code == 403
    assert client.post(f"/api/channels/{ch['id']}/test", headers={"sec-fetch-site": "cross-site"}).status_code == 403
    assert client.post(f"/api/channels/{ch['id']}/test", headers={"origin": "null"}).status_code == 403
    assert client.post("/api/trips", json={"name": "t"}, headers=EVIL).status_code == 403
    assert client.delete(f"/api/channels/{ch['id']}", headers=EVIL).status_code == 403


def test_same_origin_mutations_allowed(client, sent):
    ok = {"origin": "http://testserver", "sec-fetch-site": "same-origin"}
    assert client.post("/api/trips", json={"name": "t"}, headers=ok).status_code == 201
    ch = client.post("/api/channels", json={"name": "x", "url": "json://localhost/a"}, headers=ok).json()
    assert client.post(f"/api/channels/{ch['id']}/test", headers=ok).status_code == 200


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff"
    # also on refused responses
    assert client.get("/api/health", headers={"host": "evil"}).headers["x-frame-options"] == "DENY"


def test_docs_disabled_by_default(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


# ------------------------------------------------------------------ secrets
def test_channels_never_return_raw_url(client):
    client.post("/api/channels", json={"name": "tg", "url": "tgram://123456:SECRET-TOKEN-XYZ/987"})
    listed = client.get("/api/channels").json()
    assert listed and all("url" not in c for c in listed)
    assert "SECRET-TOKEN-XYZ" not in str(listed)


def test_db_files_private(tmp_path):
    import os
    import stat

    from sqlmodel import Session

    from app import db
    from app.models import Trip

    path = tmp_path / "f.db"
    engine = db.make_engine(f"sqlite:///{path.as_posix()}")
    old = db._engine
    db.set_engine(engine)
    try:
        # Existing database with an old install's default mode (0644)
        path.write_bytes(b"")
        os.chmod(path, 0o644)
        db.init_db()
        with Session(engine) as s:
            s.add(Trip(name="x"))
            s.commit()
        db._restrict_db_files(engine)
    finally:
        db.set_engine(old)
        engine.dispose()
    for suffix in ("", "-wal", "-shm"):
        p = f"{path}{suffix}"
        if os.path.exists(p):
            assert stat.S_IMODE(os.stat(p).st_mode) == 0o600, p


# ------------------------------------------------------------------ limits
def test_interval_and_numeric_bounds(client):
    t = _trip(client)
    big = {"query": QUERY, "check_interval_minutes": 10**16}
    assert client.post(f"/api/trips/{t['id']}/watches", json=big).status_code == 422
    w = client.post(f"/api/trips/{t['id']}/watches", json={"query": QUERY}).json()
    assert client.patch(f"/api/watches/{w['id']}", json={"check_interval_minutes": 10**16}).status_code == 422
    assert client.post("/api/rules", json={"kind": "price_drop", "cooldown_minutes": 10**16}).status_code == 422
    assert client.get(f"/api/watches/{w['id']}/history", params={"days": 10**9}).status_code == 422
    assert client.get("/api/notifications", params={"limit": -1}).status_code == 422
    assert client.get("/api/airports", params={"q": "gru", "limit": -1}).status_code == 422


def test_null_patch_is_422(client):
    t = _trip(client)
    assert client.patch(f"/api/trips/{t['id']}", json={"name": None}).status_code == 422
    ch = client.post("/api/channels", json={"name": "x", "url": "json://localhost/a"}).json()
    assert client.patch(f"/api/channels/{ch['id']}", json={"url": None}).status_code == 422


def test_duplicate_channel_ids(client):
    ch = client.post("/api/channels", json={"name": "x", "url": "json://localhost/a"}).json()
    r = client.post("/api/rules", json={"kind": "price_drop", "channel_ids": [ch["id"], ch["id"]]})
    assert r.status_code == 201, r.text


def test_count_limits(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_rules", 2)
    assert client.post("/api/rules", json={"kind": "price_drop"}).status_code == 201
    assert client.post("/api/rules", json={"kind": "price_drop"}).status_code == 201
    r = client.post("/api/rules", json={"kind": "price_drop"})
    assert r.status_code == 409 and "Limite" in r.json()["detail"]


# ------------------------------------------------------------------ search queue
def test_throttle_rejects_when_queue_full(monkeypatch):
    import pytest

    from app.config import get_settings
    from app.services import search

    monkeypatch.setattr(get_settings(), "min_seconds_between_searches", 10.0)
    monkeypatch.setattr(search, "_last_call", search.time.monotonic())
    with pytest.raises(search.SearchBusy):
        search._throttle(max_wait=1.0)


def test_search_429_when_busy(client, monkeypatch):
    from app.services import search

    def busy(*a, **kw):
        raise search.SearchBusy(99)

    monkeypatch.setattr("app.api.routes.run_search", busy)
    assert client.post("/api/search", json=QUERY).status_code == 429


def test_throttle_does_not_hold_lock_while_sleeping(monkeypatch):
    import threading
    import time

    from app.config import get_settings
    from app.services import search

    monkeypatch.setattr(get_settings(), "min_seconds_between_searches", 0.3)
    monkeypatch.setattr(search, "_last_call", time.monotonic())
    t = threading.Thread(target=search._throttle)
    t.start()
    time.sleep(0.05)
    acquired = search._lock.acquire(timeout=0.05)
    if acquired:
        search._lock.release()
    t.join()
    assert acquired


# ------------------------------------------------------------------ scheduler
def test_scheduler_start_survives_bad_row_and_skips_archived(client, monkeypatch):
    from sqlmodel import Session

    from app import db, scheduler
    from app.config import get_settings
    from app.models import FlightWatch

    t = _trip(client)
    good = client.post(f"/api/trips/{t['id']}/watches", json={"query": QUERY}).json()
    bad = client.post(f"/api/trips/{t['id']}/watches", json={"query": QUERY}).json()
    arch = _trip(client)
    archived = client.post(f"/api/trips/{arch['id']}/watches", json={"query": QUERY}).json()
    client.patch(f"/api/trips/{arch['id']}", json={"archived": True})
    with Session(db.get_engine()) as s:  # legacy row outside the current limit
        w = s.get(FlightWatch, bad["id"])
        w.check_interval_minutes = 10**16
        s.add(w)
        s.commit()
    monkeypatch.setattr(get_settings(), "scheduler_enabled", True)
    try:
        scheduler.start()
        assert scheduler.next_run(good["id"]) is not None
        assert scheduler.next_run(bad["id"]) is None
        assert scheduler.next_run(archived["id"]) is None
    finally:
        scheduler.shutdown()


def test_redact_password_with_at():
    from app.providers.http import redact

    assert redact("via http://user:p@ss@proxy:8080/x") == "via http://***@proxy:8080/x"
