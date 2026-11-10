"""Requests to the public Google Flights page (/travel/flights).

With NOTIFLY_PROXY_URL each request gets up to 3 attempts, each on a new client, so a
rotating proxy exits through another IP. Without a proxy it gets one attempt, since
retrying from the same IP only extends the block.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable

from app.config import get_settings

log = logging.getLogger(__name__)

URL = "https://www.google.com/travel/flights"
PROXY_ATTEMPTS = 3
RETRY_DELAY = 2.0  # seconds; grows with each attempt
TIMEOUT = 45.0

# fast-flights reads the data from this <script>; without it this isn't a results page.
DATA_SCRIPT_RE = re.compile(r"<script[^>]*class=\"?ds:1\"?")
CREDENTIALS_RE = re.compile(r"(?<=://)[^/\s]*@")


class Blocked(Exception):
    """Google didn't return the results page (rate limit, captcha, consent)."""


def redact(text: str) -> str:
    """Hide user:password of proxy URLs in messages."""
    return CREDENTIALS_RE.sub("***@", str(text))


def attempts() -> int:
    return PROXY_ATTEMPTS if get_settings().proxy_url else 1


def with_retries[T](fn: Callable[[], T], what: str, giveup: tuple[type[BaseException], ...] = ()) -> T:
    """Run ``fn`` up to ``attempts()`` times. Errors in ``giveup`` aren't retried."""
    total = attempts()
    for attempt in range(1, total + 1):
        try:
            return fn()
        except giveup:
            raise
        except Exception as e:  # noqa: BLE001
            if attempt == total:
                raise
            log.warning("%s falhou (tentativa %d/%d): %s", what, attempt, total, redact(e))
            time.sleep(RETRY_DELAY * attempt)
    raise AssertionError("unreachable")


def _client(proxy: str | None):
    from primp import Client

    return Client(
        impersonate="chrome_145",
        impersonate_os="macos",
        referer=True,
        proxy=proxy or None,
        cookie_store=True,
        timeout=TIMEOUT,
    )


def check_page(status: int, url: str, html: str) -> None:
    if status == 429:
        raise Blocked("limite de requisições (HTTP 429)")
    if "/sorry/" in url:
        raise Blocked("verificação anti-robô do Google")
    if "consent.google." in url:
        raise Blocked("página de consentimento de cookies")
    if status >= 400:
        raise Blocked(f"HTTP {status}")
    if not DATA_SCRIPT_RE.search(html):
        raise Blocked("resposta sem dados de voos")


def fetch_html(params: dict, proxy: str | None = None) -> str:
    """One request to the results page, on a new client."""
    r = _client(proxy).get(URL, params=params)
    html = r.text
    check_page(r.status_code, str(r.url), html)
    return html
