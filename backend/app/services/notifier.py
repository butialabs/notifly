"""Notifications via Apprise (Telegram, e-mail, Discord, Slack, WhatsApp, ntfy...)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import apprise

from app import i18n

log = logging.getLogger(__name__)


@dataclass
class SendResult:
    ok: bool
    error: str | None = None


def validate_url(url: str) -> bool:
    a = apprise.Apprise()
    return bool(a.add(url))


def mask_url(url: str) -> str:
    """Channel URL without secrets (tokens, passwords), for display."""
    try:
        plugin = apprise.Apprise.instantiate(url)
        if plugin:
            return plugin.url(privacy=True)
    except Exception:  # noqa: BLE001
        pass
    scheme, _, rest = url.partition("://")
    return f"{scheme}://…" if rest else "…"


def send(url: str, title: str, body: str) -> SendResult:
    a = apprise.Apprise()
    if not a.add(url):
        return SendResult(False, "URL Apprise inválida ou serviço não suportado")
    with apprise.LogCapture(level=logging.WARNING) as logs:
        try:
            ok = a.notify(title=title, body=body, body_format=apprise.NotifyFormat.MARKDOWN)
        except Exception as e:  # noqa: BLE001
            log.exception("Falha no Apprise")
            return SendResult(False, str(e))
        captured = logs.getvalue().strip()
    return SendResult(bool(ok), None if ok else (captured or i18n.t("notify.send_failed")))


def fmt_money(value: float | None, currency: str | None) -> str:
    if value is None:
        return "—"
    cur = (currency or "").upper()
    symbol = {"BRL": "R$", "USD": "US$", "EUR": "€", "GBP": "£"}.get(cur, cur)
    s = f"{value:,.0f}"
    if i18n.current_lang() == "pt-BR":
        s = s.replace(",", ".")
    return f"{symbol} {s}"


def fmt_date(d) -> str:
    if i18n.current_lang() == "pt-BR":
        return d.strftime("%d/%m/%Y")
    return f"{d:%b} {d.day}, {d.year}"


def fmt_duration(minutes: int | None) -> str:
    if not minutes:
        return "—"
    h, m = divmod(int(minutes), 60)
    return f"{h}h{m:02d}" if m else f"{h}h"
