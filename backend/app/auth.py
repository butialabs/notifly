"""Optional single-password login (NOTIFLY_PASSWORD).

The session cookie is "<expires_at>.<hmac>". The key derives from a random secret in
data_dir/session.key and from the password, so changing the password ends every session.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import deque
from functools import lru_cache
from http.cookies import CookieError, SimpleCookie

from app.config import get_settings

COOKIE_NAME = "notifly_session"
# Wrong attempts per IP before blocking, and the window they count in
MAX_FAILURES = 10
FAILURE_WINDOW_SECONDS = 15 * 60


@lru_cache
def _secret() -> bytes:
    path = get_settings().data_dir / "session.key"
    try:
        data = path.read_bytes()
        if len(data) >= 32:
            return data
    except FileNotFoundError:
        pass
    data = secrets.token_bytes(32)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    return data


def _password() -> str | None:
    pw = get_settings().password
    value = pw.get_secret_value() if pw is not None else ""
    return value or None


def enabled() -> bool:
    return _password() is not None


def _key(password: str) -> bytes:
    return hmac.new(_secret(), b"session:" + password.encode(), hashlib.sha256).digest()


def make_token() -> str:
    password = _password()
    assert password is not None
    expires = int(time.time()) + get_settings().session_days * 86400
    sig = hmac.new(_key(password), str(expires).encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{sig}"


def token_valid(token: str | None) -> bool:
    password = _password()
    if password is None:
        return True
    if not token or "." not in token:
        return False
    expires, _, sig = token.partition(".")
    if not expires.isdigit() or int(expires) < time.time():
        return False
    expected = hmac.new(_key(password), expires.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


def password_matches(given: str) -> bool:
    password = _password()
    if password is None:
        return False
    # compare fixed-size hashes so timing doesn't leak the password length
    a = hashlib.sha256(given.encode()).digest()
    b = hashlib.sha256(password.encode()).digest()
    return hmac.compare_digest(a, b)


def token_from_cookie_header(header: str | None) -> str | None:
    if not header:
        return None
    try:
        jar = SimpleCookie(header)
    except CookieError:
        return None
    morsel = jar.get(COOKIE_NAME)
    return morsel.value if morsel else None


# ------------------------------------------------------------------ rate limit
_failures: dict[str, deque[float]] = {}
_lock = threading.Lock()


def _prune(q: deque[float], now: float) -> None:
    while q and now - q[0] > FAILURE_WINDOW_SECONDS:
        q.popleft()


def retry_after(ip: str) -> int:
    """Seconds until the IP may try again; 0 if it can try now."""
    now = time.monotonic()
    with _lock:
        q = _failures.get(ip)
        if not q:
            return 0
        _prune(q, now)
        if len(q) < MAX_FAILURES:
            return 0
        return max(1, int(FAILURE_WINDOW_SECONDS - (now - q[0])))


def record_failure(ip: str) -> None:
    now = time.monotonic()
    with _lock:
        if len(_failures) > 10_000:  # cap memory use
            for k in [k for k, q in _failures.items() if not q or now - q[-1] > FAILURE_WINDOW_SECONDS]:
                del _failures[k]
        q = _failures.setdefault(ip, deque())
        _prune(q, now)
        q.append(now)


def reset_failures(ip: str | None = None) -> None:
    with _lock:
        if ip is None:
            _failures.clear()
        else:
            _failures.pop(ip, None)
