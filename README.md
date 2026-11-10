# Notifly ✈️

[![CI](https://github.com/butialabs/notifly/actions/workflows/ci.yml/badge.svg)](https://github.com/butialabs/notifly/actions/workflows/ci.yml)
[![CodeQL](https://github.com/butialabs/notifly/actions/workflows/codeql.yml/badge.svg)](https://github.com/butialabs/notifly/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/butialabs/notifly?sort=semver)](https://github.com/butialabs/notifly/releases)
[![Docker image](https://img.shields.io/badge/ghcr.io-butialabs%2Fnotifly-2496ED?logo=docker&logoColor=white)](https://github.com/butialabs/notifly/pkgs/container/notifly)
[![License: AGPL-3.0](https://img.shields.io/github/license/butialabs/notifly)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-frontend-61DAFB?logo=react&logoColor=black)](https://react.dev/)

Notifly is a self-hosted flight price tracker. You create a trip and add its flights (outbound, return, internal legs). Notifly re-runs the searches on a schedule, keeps the price history and notifies you when a price drops, rises or crosses a threshold.

> Notifly is not affiliated with or endorsed by Google. It reads the public Google Flights page through an unofficial library, which may break at any time and may not be allowed by Google's Terms of Service. It is meant for personal, low-volume use, and you are responsible for how you run it. Notifly never books anything; you buy on the airline or travel site.

## Quick start

```bash
mkdir notifly && cd notifly
curl -fsSLO https://raw.githubusercontent.com/butialabs/notifly/main/compose.yml
curl -fsSL https://raw.githubusercontent.com/butialabs/notifly/main/.env.example -o .env   # then edit it
docker compose up -d
```

Open http://localhost:8000. 

## Configuration

| Variable | Default | Description |
|---|---|---|
| `NOTIFLY_PASSWORD` | *(empty)* | Password for the UI and API. Empty means no login |
| `NOTIFLY_PUBLIC_URL` | `http://localhost:8000` | Used in notification links and as an allowed host |
| `NOTIFLY_CURRENCY` | `US` | Currency sent to Google Flights |
| `NOTIFLY_LANGUAGE` | `en` | Language sent to Google, also used for notifications and server messages (`pt*` is Portuguese, anything else English) |
| `NOTIFLY_COUNTRY` | `US` | Country sent to Google Flights |
| `TZ` | `UTC` | Container time zone |
| `NOTIFLY_DEFAULT_CHECK_INTERVAL_MINUTES` | `360` | Default interval between checks of a flight |
| `NOTIFLY_MIN_SECONDS_BETWEEN_SEARCHES` | `4` | Minimum pause between requests to Google |
| `NOTIFLY_PROXY_URL` | *(empty)* | Proxy for requests to Google (see [Google limits](#google-limits)) |
| `NOTIFLY_ALLOWED_HOSTS` | host of `NOTIFLY_PUBLIC_URL` + localhost | Accepted `Host` headers, comma separated |

## Google limits

Too many searches in a row make Google refuse requests for minutes or hours (HTTP 429, the `/sorry/` anti-bot page, or a page with no flight data). The app then reports "Google refused the search" instead of "no flights". To reduce blocks:

- with `NOTIFLY_PROXY_URL` (e.g. `https://user:pass@host:8443`), every request goes through the proxy and gets up to 3 attempts, each on a new connection, so a rotating proxy uses a new IP.

## Development

```bash
# backend (Python 3.12)
cd backend
pip install -r requirements-dev.txt
NOTIFLY_DATA_DIR=./data uvicorn app.main:app --reload
pytest

# frontend (proxies /api to :8000)
cd frontend
npm install
npm run dev
```

To rebuild the airport, airline and country data (OurAirports, CLDR country names and the `fli` enums), install `backend/requirements-dev.txt` and run `python backend/scripts/build_airports.py`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute, including translations.

## License

[GNU AGPL-3.0](LICENSE). If you run a modified version as a network service, you must offer its source code to its users. Third-party data and libraries are credited in [NOTICE](NOTICE).
