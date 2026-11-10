import pytest
from pydantic import SecretStr

from app import auth
from app.config import get_settings


@pytest.fixture
def with_password(monkeypatch):
    monkeypatch.setattr(get_settings(), "password", SecretStr("s3nha-forte"))
    auth.reset_failures()
    yield
    auth.reset_failures()


def test_disabled_by_default(client):
    assert client.get("/api/auth/status").json() == {"enabled": False, "authenticated": True}
    assert client.get("/api/trips").status_code == 200


def test_api_requires_login(client, with_password):
    assert client.get("/api/trips").status_code == 401
    assert client.post("/api/trips", json={"name": "x"}).status_code == 401
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/auth/status").json() == {"enabled": True, "authenticated": False}


def test_login_logout_flow(client, with_password):
    assert client.post("/api/auth/login", json={"password": "errada"}).status_code == 401
    r = client.post("/api/auth/login", json={"password": "s3nha-forte"})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert client.get("/api/trips").status_code == 200
    assert client.get("/api/auth/status").json()["authenticated"] is True
    client.post("/api/auth/logout")
    assert client.get("/api/trips").status_code == 401


def test_password_change_invalidates_sessions(client, with_password, monkeypatch):
    client.post("/api/auth/login", json={"password": "s3nha-forte"})
    assert client.get("/api/trips").status_code == 200
    monkeypatch.setattr(get_settings(), "password", SecretStr("outra"))
    assert client.get("/api/trips").status_code == 401


def test_forged_or_expired_token_rejected(client, with_password):
    for token in ("", "abc", "99999999999.deadbeef", f"1.{'0' * 64}"):
        client.cookies.set(auth.COOKIE_NAME, token)
        assert client.get("/api/trips").status_code == 401, token


def test_login_rate_limited(client, with_password):
    for _ in range(auth.MAX_FAILURES):
        assert client.post("/api/auth/login", json={"password": "x"}).status_code == 401
    r = client.post("/api/auth/login", json={"password": "s3nha-forte"})
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_cross_site_login_rejected(client, with_password):
    r = client.post("/api/auth/login", json={"password": "s3nha-forte"}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403


def test_empty_password_means_disabled(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "password", SecretStr(""))
    assert client.get("/api/trips").status_code == 200
