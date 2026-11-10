"""Airport, city and airline autocomplete."""

from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from pathlib import Path

from app import i18n

DATA = Path(__file__).with_name("airports.json")
AIRLINES = Path(__file__).with_name("airlines.json")
COUNTRIES = Path(__file__).with_name("countries.json")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


@lru_cache
def _load() -> dict:
    raw = json.loads(DATA.read_text(encoding="utf-8"))
    airports = raw["airports"]
    for a in airports:
        a["_name"] = norm(a["name"])
        a["_city"] = norm(a["city"])
        # match the country name in any language
        a["_countries"] = {norm(a["country"])} | {
            norm(names[a["country_code"]]) for names in _countries().values() if a["country_code"] in names
        }
    by_code = {a["code"]: a for a in airports}
    cities = raw["cities"]
    for c in cities:
        names = [c["city"], *c.get("names", {}).values()]
        c["_keys"] = list(dict.fromkeys([norm(n) for n in names] + [norm(x) for x in c.get("aliases", [])]))
    return {"airports": airports, "by_code": by_code, "cities": cities}


@lru_cache
def _countries() -> dict[str, dict[str, str]]:
    """Language -> ISO country code -> name."""
    try:
        return json.loads(COUNTRIES.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def _country(item: dict) -> str:
    return _countries().get(i18n.current_lang(), {}).get(item["country_code"]) or item["country"]


@lru_cache
def _airlines() -> dict[str, str]:
    """IATA code -> name (built by scripts/build_airports.py)."""
    return json.loads(AIRLINES.read_text(encoding="utf-8"))


def get_airport(code: str) -> dict | None:
    return _load()["by_code"].get(code.upper())


def _public(a: dict) -> dict:
    return {
        "type": "airport",
        "code": a["code"],
        "codes": [a["code"]],
        "name": a["name"],
        "city": a["city"],
        "country": _country(a),
        "country_code": a["country_code"],
    }


def _city_public(c: dict) -> dict:
    city = c.get("names", {}).get(i18n.current_lang()) or c["city"]
    return {
        "type": "city",
        "code": c["codes"][0],
        "codes": c["codes"],
        "name": i18n.t("place.all_airports", city=city),
        "city": city,
        "country": _country(c),
        "country_code": c["country_code"],
    }


def resolve_place(codes: list[str]) -> dict | None:
    """Rebuild the place from the codes saved in a query (one airport or a city)."""
    wanted = [c.strip().upper() for c in codes if c.strip()]
    if len(wanted) == 1:
        a = get_airport(wanted[0])
        return _public(a) if a else None
    cities = _load()["cities"]
    for c in cities:
        if set(c["codes"]) == set(wanted):
            return _city_public(c)
    # A subset of a city's airports (e.g. GRU/CGH): label with the codes and the city.
    for c in cities:
        if set(wanted) <= set(c["codes"]):
            first = get_airport(wanted[0])
            return {**(_public(first) if first else _city_public(c)), "type": "airport", "codes": wanted, "city": c.get("names", {}).get(i18n.current_lang()) or c["city"]}
    return None


def search_places(q: str, limit: int = 10) -> list[dict]:
    """Cities (multi-airport) and airports, sorted by relevance."""
    data = _load()
    nq = norm(q)
    if not nq:
        return []
    results: list[tuple[float, dict]] = []

    for c in data["cities"]:
        score = 0.0
        for key in c["_keys"]:
            if key == nq:
                score = max(score, 100)
            elif key.startswith(nq):
                score = max(score, 90 - len(key) * 0.1)
        if score:
            # on a tie, the city beats its main airport
            results.append((score + 1, _city_public(c)))

    upper = q.strip().upper()
    for a in data["airports"]:
        score = 0.0
        if len(upper) == 3 and a["code"] == upper:
            score = 120
        elif a["_city"] == nq:
            score = 80
        elif a["_city"].startswith(nq):
            score = 70
        elif len(nq) >= 2 and a["code"].lower().startswith(nq):
            score = 65
        elif nq in a["_name"]:
            score = 50 if a["_name"].startswith(nq) else 40
        elif len(nq) >= 3 and any(n.startswith(nq) for n in a["_countries"]):
            score = 20
        if score:
            results.append((score + a["rank"] * 3, _public(a)))

    results.sort(key=lambda r: -r[0])
    return [r[1] for r in results[:limit]]


def search_airlines(q: str, limit: int = 10) -> list[dict]:
    nq = norm(q)
    out = []
    for code, name in _airlines().items():
        nname = norm(name)
        if code.lower() == nq:
            score = 100
        elif nname.startswith(nq):
            score = 60
        elif nq in nname:
            score = 40
        else:
            continue
        out.append((score, {"code": code, "name": name}))
    out.sort(key=lambda r: (-r[0], r[1]["name"]))
    return [r[1] for r in out[:limit]]


def airline_name(code: str) -> str:
    return _airlines().get(code.upper().removeprefix("_")) or code
