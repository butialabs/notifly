"""Search layer: global throttle, short cache and stats."""

from __future__ import annotations

import json
import statistics
import threading
import time

from app import i18n
from app.config import get_settings
from app.providers.fastflights_provider import get_provider
from app.schemas import FlightQuery, Offer, SearchResult
from app.services.booking_links import google_flights_url

_lock = threading.Lock()
_last_call = 0.0
_cache: dict[str, tuple[float, object]] = {}
CACHE_TTL = 300


class SearchBusy(Exception):
    def __init__(self, wait: float):
        super().__init__(i18n.t("search.busy", wait=int(wait)))
        self.wait = wait


def _throttle(max_wait: float | None = None) -> None:
    """Space out requests to Google to avoid blocks.

    Reserves the next free slot under the lock and waits outside it, so the queue doesn't
    hold the lock. With ``max_wait``, raises SearchBusy instead of queueing too long.
    """
    global _last_call
    gap = get_settings().min_seconds_between_searches
    with _lock:
        now = time.monotonic()
        slot = max(now, _last_call + gap)
        wait = slot - now
        if max_wait is not None and wait > max_wait:
            raise SearchBusy(wait)
        _last_call = slot
    if wait > 0:
        time.sleep(wait)


def _key(*parts) -> str:
    return json.dumps(parts, sort_keys=True, default=str)


def _cached(key: str):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL:
        return hit[1]
    return None


def _store(key: str, value) -> None:
    if len(_cache) > 200:
        _cache.clear()
    _cache[key] = (time.monotonic(), value)


def summarize(offers: list[Offer]) -> tuple[float | None, float | None, str | None]:
    prices = [o.price for o in offers if o.price is not None]
    if not prices:
        return None, None, None
    currency = next((o.currency for o in offers if o.currency), None)
    return min(prices), statistics.median(prices), currency


def run_search(query: FlightQuery, use_cache: bool = True, max_wait: float | None = None) -> SearchResult:
    s = get_settings()
    key = _key("search", query.model_dump(mode="json"), s.currency)
    if use_cache and (hit := _cached(key)):
        return hit
    _throttle(max_wait)
    t0 = time.monotonic()
    provider = get_provider()
    offers = provider.search(query, s.currency)
    elapsed = int((time.monotonic() - t0) * 1000)
    mn, med, cur = summarize(offers)
    result = SearchResult(
        offers=offers,
        min_price=mn,
        median_price=med,
        currency=cur or s.currency,
        count=len(offers),
        google_flights_url=google_flights_url(query),
        elapsed_ms=elapsed,
        provider=provider.name,
    )
    if offers:
        _store(key, result)
    return result

