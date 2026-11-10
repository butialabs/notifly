"""Server messages in pt-BR and en.

In a request the language comes from Accept-Language (the SPA sends the UI language).
Elsewhere (scheduler, notifications) it follows NOTIFLY_LANGUAGE: "pt*" -> pt-BR, else en.
"""

from __future__ import annotations

from contextvars import ContextVar
from functools import lru_cache

from app.config import get_settings

LANGS = ("pt-BR", "en")

MESSAGES: dict[str, dict[str, str]] = {
    "pt-BR": {
        # HTTP / security
        "http.host_not_allowed": "Host não permitido: {host}. Adicione-o em NOTIFLY_ALLOWED_HOSTS.",
        "http.empty": "(vazio)",
        "http.cross_site": "Pedido de outro site recusado.",
        "http.cross_origin": "Pedido de outra origem recusado.",
        "http.json_only": "Envie o corpo como application/json.",
        "http.not_found": "Não encontrado",
        # login
        "auth.required": "Faça login para continuar.",
        "auth.wrong_password": "Senha incorreta.",
        "auth.too_many": "Muitas tentativas erradas. Tente de novo em {minutes} min.",
        # limits and actions
        "limit.reached": "Limite de {maximum} {what} atingido. Exclua algum antes de criar outro.",
        "limit.watches": "voos monitorados",
        "limit.channels": "canais",
        "limit.rules": "alertas",
        "check.cooldown": "Calma: este voo foi checado há {elapsed} s. Espere {wait} s — buscar demais faz o Google bloquear.",
        "check.running": "Checagem já em andamento",
        "search.busy": "Fila de buscas cheia ({wait} s). Tente de novo em instantes.",
        "channel.invalid_url": "URL Apprise inválida ou serviço não suportado",
        "channel.test_title": "✈️ Notifly: teste de notificação",
        "channel.test_body": "Se você recebeu isto, o canal **{name}** está funcionando.",
        "rule.threshold_required": "Informe o valor limite",
        # validation
        "val.no_passenger": "Informe pelo menos um passageiro",
        "val.lap_infant": "Cada bebê de colo precisa de um adulto",
        "val.no_airport": "Informe pelo menos um aeroporto",
        "val.too_many_airports": "Escolha um lugar por campo (no máximo 6 aeroportos de uma cidade)",
        "val.return_required": "Ida e volta precisa de data de volta",
        "val.return_before": "A volta não pode ser antes da ida",
        "val.not_null": "não pode ser nulo",
        # provider
        "provider.blocked": "O Google recusou a busca ({reason}). Normalmente é um limite temporário — tente novamente em alguns minutos.",
        "provider.failed": "Falha ao consultar o Google Flights: {error}",
        # checks / notifications
        "check.departed": "Data de partida já passou — monitoramento pausado.",
        "check.no_price": "Nenhum preço encontrado",
        "notify.no_channel": "Nenhum canal de notificação configurado",
        "notify.send_failed": "Falha ao enviar",
        "notify.price_drop": "caiu para {price}",
        "notify.price_rise": "subiu para {price}",
        "notify.price_change": "agora {price}",
        "notify.below_threshold": "{price} — abaixo de {threshold}",
        "notify.above_threshold": "{price} — acima de {threshold}",
        "notify.new_lowest": "menor preço já visto: {price}",
        "notify.trip_fallback": "Viagem",
        "notify.dates": "Datas: {dates}",
        "notify.current": "Preço atual: **{price}**{change}",
        "notify.previous": "Checagem anterior: {price}",
        "notify.lowest": "Menor já visto: {price}",
        "notify.nonstop": "direto",
        "notify.stops": "{n} escala(s)",
        "notify.best": "Melhor oferta: {airlines} · {stops} · {duration}",
        "notify.rule": "Regra: {rule}",
        "notify.open": "Ver no Notifly",
        # rules
        "kind.price_drop": "Preço caiu",
        "kind.price_rise": "Preço subiu",
        "kind.price_change": "Preço mudou",
        "kind.below_threshold": "Abaixo do limite",
        "kind.above_threshold": "Acima do limite",
        "kind.new_lowest": "Menor preço já visto",
        # airports
        "place.all_airports": "{city} (todos os aeroportos)",
    },
    "en": {
        "http.host_not_allowed": "Host not allowed: {host}. Add it to NOTIFLY_ALLOWED_HOSTS.",
        "http.empty": "(empty)",
        "http.cross_site": "Request from another site refused.",
        "http.cross_origin": "Request from another origin refused.",
        "http.json_only": "Send the body as application/json.",
        "http.not_found": "Not found",
        "auth.required": "Log in to continue.",
        "auth.wrong_password": "Wrong password.",
        "auth.too_many": "Too many wrong attempts. Try again in {minutes} min.",
        "limit.reached": "Limit of {maximum} {what} reached. Delete one before creating another.",
        "limit.watches": "tracked flights",
        "limit.channels": "channels",
        "limit.rules": "alerts",
        "check.cooldown": "Easy there: this flight was checked {elapsed} s ago. Wait {wait} s — searching too often gets you blocked by Google.",
        "check.running": "A check is already running",
        "search.busy": "Search queue is full ({wait} s). Try again in a moment.",
        "channel.invalid_url": "Invalid Apprise URL or unsupported service",
        "channel.test_title": "✈️ Notifly: test notification",
        "channel.test_body": "If you got this, the **{name}** channel works.",
        "rule.threshold_required": "Enter the threshold price",
        "val.no_passenger": "Add at least one passenger",
        "val.lap_infant": "Each lap infant needs an adult",
        "val.no_airport": "Enter at least one airport",
        "val.too_many_airports": "Pick one place per field (at most 6 airports of one city)",
        "val.return_required": "A round trip needs a return date",
        "val.return_before": "The return can't be before the departure",
        "val.not_null": "can't be null",
        "provider.blocked": "Google refused the search ({reason}). It's usually a temporary limit — try again in a few minutes.",
        "provider.failed": "Google Flights request failed: {error}",
        "check.departed": "Departure date has passed — tracking paused.",
        "check.no_price": "No price found",
        "notify.no_channel": "No notification channel configured",
        "notify.send_failed": "Sending failed",
        "notify.price_drop": "dropped to {price}",
        "notify.price_rise": "rose to {price}",
        "notify.price_change": "now {price}",
        "notify.below_threshold": "{price} — below {threshold}",
        "notify.above_threshold": "{price} — above {threshold}",
        "notify.new_lowest": "lowest price ever seen: {price}",
        "notify.trip_fallback": "Trip",
        "notify.dates": "Dates: {dates}",
        "notify.current": "Current price: **{price}**{change}",
        "notify.previous": "Previous check: {price}",
        "notify.lowest": "Lowest seen: {price}",
        "notify.nonstop": "nonstop",
        "notify.stops": "{n} stop(s)",
        "notify.best": "Best offer: {airlines} · {stops} · {duration}",
        "notify.rule": "Rule: {rule}",
        "notify.open": "Open in Notifly",
        "kind.price_drop": "Price dropped",
        "kind.price_rise": "Price rose",
        "kind.price_change": "Price changed",
        "kind.below_threshold": "Below threshold",
        "kind.above_threshold": "Above threshold",
        "kind.new_lowest": "Lowest price ever seen",
        "place.all_airports": "{city} (all airports)",
    },
}

_current: ContextVar[str | None] = ContextVar("notifly_lang", default=None)


def normalize(value: str | None) -> str | None:
    """'pt', 'pt-PT', 'pt_BR' -> 'pt-BR'; 'en-US' -> 'en'; other/empty -> None."""
    v = (value or "").strip().lower().replace("_", "-")
    if v.startswith("pt"):
        return "pt-BR"
    if v.startswith("en"):
        return "en"
    return None


def from_accept_language(header: str | None) -> str | None:
    """First supported language in Accept-Language, honoring q= weights."""
    if not header:
        return None
    ranked: list[tuple[float, int, str]] = []
    for i, part in enumerate(header.split(",")):
        tag, _, params = part.strip().partition(";")
        q = 1.0
        params = params.strip()
        if params.startswith("q="):
            try:
                q = float(params[2:])
            except ValueError:
                q = 0.0
        lang = normalize(tag)
        if lang and q > 0:
            ranked.append((-q, i, lang))
    return min(ranked)[2] if ranked else None


@lru_cache
def _default_for(language: str) -> str:
    return normalize(language) or "en"


def default_lang() -> str:
    return _default_for(get_settings().language)


def current_lang() -> str:
    return _current.get() or default_lang()


def set_lang(lang: str | None):
    """Set the language for the current context; returns the token for `reset_lang`."""
    return _current.set(lang if lang in LANGS else None)


def reset_lang(token) -> None:
    _current.reset(token)


def t(key: str, lang: str | None = None, **kwargs) -> str:
    lang = lang or current_lang()
    text = MESSAGES.get(lang, {}).get(key) or MESSAGES["pt-BR"].get(key) or key
    return text.format(**kwargs) if kwargs else text
