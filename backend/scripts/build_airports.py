"""Build app/airports/airports.json (OurAirports + the fli airport enum),
app/airports/airlines.json (the fli airline enum) and
app/airports/countries.json (pt-BR and en country names from CLDR, via babel).

`flights` (fli) is only used here; it's in requirements-dev.txt. With that installed:
    python scripts/build_airports.py
"""

import csv
import io
import json
import urllib.request
from pathlib import Path

from babel import Locale
from fli.models.airline import AIRLINE_NAMES
from fli.models.airport import AIRPORT_NAMES

SRC = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OUT = Path(__file__).resolve().parents[1] / "app" / "airports" / "airports.json"
OUT_AIRLINES = OUT.with_name("airlines.json")
OUT_COUNTRIES = OUT.with_name("countries.json")
LANGS = {"pt-BR": "pt_BR", "en": "en"}
# (PT name, EN name, search aliases, codes)
METROS = [
    ("São Paulo", "São Paulo", ["sao paulo", "sp", "sampa"], ["GRU", "CGH", "VCP"]),
    ("Rio de Janeiro", "Rio de Janeiro", ["rio", "rj"], ["GIG", "SDU"]),
    ("Belo Horizonte", "Belo Horizonte", ["bh", "beaga"], ["CNF", "PLU"]),
    ("Nova York", "New York", ["new york", "nyc", "ny"], ["JFK", "EWR", "LGA"]),
    ("Chicago", "Chicago", [], ["ORD", "MDW"]),
    ("Washington", "Washington", ["washington dc", "dc"], ["IAD", "DCA", "BWI"]),
    ("Londres", "London", ["london"], ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"]),
    ("Paris", "Paris", [], ["CDG", "ORY", "BVA"]),
    ("Tóquio", "Tokyo", ["tokyo", "toquio"], ["HND", "NRT"]),
    ("Osaka", "Osaka", [], ["KIX", "ITM"]),
    ("Seul", "Seoul", ["seoul"], ["ICN", "GMP"]),
    ("Pequim", "Beijing", ["beijing"], ["PEK", "PKX"]),
    ("Xangai", "Shanghai", ["shanghai"], ["PVG", "SHA"]),
    ("Bangkok", "Bangkok", [], ["BKK", "DMK"]),
    ("Istambul", "Istanbul", ["istanbul"], ["IST", "SAW"]),
    ("Moscou", "Moscow", ["moscow"], ["SVO", "DME", "VKO"]),
    ("Milão", "Milan", ["milan", "milao"], ["MXP", "LIN", "BGY"]),
    ("Roma", "Rome", ["rome"], ["FCO", "CIA"]),
    ("Toronto", "Toronto", [], ["YYZ", "YTZ"]),
    ("Buenos Aires", "Buenos Aires", [], ["EZE", "AEP"]),
    ("Dubai", "Dubai", [], ["DXB", "DWC"]),
    ("Taipé", "Taipei", ["taipei"], ["TPE", "TSA"]),
    ("São Francisco", "San Francisco", ["san francisco", "sf", "bay area"], ["SFO", "OAK", "SJC"]),
    ("Los Angeles", "Los Angeles", ["la"], ["LAX", "BUR", "SNA", "ONT", "LGB"]),
    ("Dallas", "Dallas", [], ["DFW", "DAL"]),
    ("Houston", "Houston", [], ["IAH", "HOU"]),
    ("Miami", "Miami", [], ["MIA", "FLL"]),
    ("Orlando", "Orlando", [], ["MCO", "SFB"]),
    ("Estocolmo", "Stockholm", ["stockholm"], ["ARN", "BMA"]),
    ("Oslo", "Oslo", [], ["OSL", "TRF"]),
    ("Barcelona", "Barcelona", [], ["BCN", "GRO"]),
    ("Bruxelas", "Brussels", ["brussels"], ["BRU", "CRL"]),
    ("Frankfurt", "Frankfurt", [], ["FRA", "HHN"]),
    ("Montreal", "Montreal", [], ["YUL", "YMX"]),
    ("Cidade do México", "Mexico City", ["mexico city"], ["MEX", "NLU"]),
    ("Jacarta", "Jakarta", ["jakarta"], ["CGK", "HLP"]),
]
TYPE_RANK = {"large_airport": 3, "medium_airport": 2, "small_airport": 1}


def main() -> None:
    raw = urllib.request.urlopen(SRC, timeout=60).read().decode("utf-8")
    territories = Locale.parse("pt_BR").territories
    airports = []
    seen = set()
    for row in csv.DictReader(io.StringIO(raw)):
        code = (row.get("iata_code") or "").strip().upper()
        if len(code) != 3 or code in seen or code not in AIRPORT_NAMES:
            continue
        if row["type"] not in TYPE_RANK:
            continue
        if row["scheduled_service"] != "yes" and row["type"] != "large_airport":
            continue
        seen.add(code)
        cc = row["iso_country"]
        airports.append(
            {
                "code": code,
                "name": row["name"],
                "city": row["municipality"] or "",
                "country_code": cc,
                "country": territories.get(cc, cc),
                "rank": TYPE_RANK[row["type"]],
                "lat": round(float(row["latitude_deg"]), 4),
                "lon": round(float(row["longitude_deg"]), 4),
            }
        )

    # Metro areas (a Google Flights "city" code covers several airports)
    by_code = {a["code"]: a for a in airports}
    cities = []
    for name, name_en, aliases, codes in METROS:
        codes = [c for c in codes if c in by_code]
        if len(codes) < 2:
            continue
        cc = by_code[codes[0]]["country_code"]
        cities.append(
            {"city": name, "names": {"pt-BR": name, "en": name_en}, "aliases": aliases,
             "country_code": cc, "country": territories.get(cc, cc), "codes": codes}
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"airports": airports, "cities": cities}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"{len(airports)} aeroportos, {len(cities)} cidades -> {OUT}")

    ccs = sorted({a["country_code"] for a in airports})
    countries = {}
    for lang, loc in LANGS.items():
        names = Locale.parse(loc).territories
        countries[lang] = {cc: names.get(cc, cc) for cc in ccs}
    OUT_COUNTRIES.write_text(json.dumps(countries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(ccs)} países -> {OUT_COUNTRIES}")

    airlines = dict(sorted((k.removeprefix("_"), v) for k, v in AIRLINE_NAMES.items()))
    OUT_AIRLINES.write_text(json.dumps(airlines, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(airlines)} companhias -> {OUT_AIRLINES}")


if __name__ == "__main__":
    main()
