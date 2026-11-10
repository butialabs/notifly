"""HTTP protections. Login is optional (NOTIFLY_PASSWORD); with or without it, other
sites can't use the owner's browser against the API.

- Host not in the allow list -> 400 (DNS rebinding).
- Data-changing request from another site (Sec-Fetch-Site / Origin) -> 403 (CSRF).
- Body without Content-Type application/json -> 415 (blocks cross-site "simple" POSTs).
- Password set and no valid session cookie on the API -> 401.
- Anti-framing headers on every response (clickjacking).
"""

from __future__ import annotations

from urllib.parse import urlsplit

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app import auth, i18n
from app.config import get_settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
# Paths that need a session when a password is set (the SPA shell itself holds no data)
PROTECTED_PREFIXES = ("/api/", "/docs", "/redoc", "/openapi.json")
PUBLIC_PATHS = {"/api/health"}
PUBLIC_PREFIXES = ("/api/auth/",)
SECURITY_HEADERS = [
    (b"x-frame-options", b"DENY"),
    (b"content-security-policy", b"frame-ancestors 'none'"),
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"same-origin"),
]


def _hostname(value: str) -> str:
    """'Example.com:8021' / '[::1]:80' -> 'example.com' / '::1'."""
    try:
        return (urlsplit(f"//{value}").hostname or "").lower()
    except ValueError:
        return ""


class SecurityMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        token = i18n.set_lang(i18n.from_accept_language(headers.get("accept-language")))
        try:
            await self._handle(scope, receive, send, headers)
        finally:
            i18n.reset_lang(token)

    async def _handle(self, scope: Scope, receive: Receive, send: Send, headers: dict[str, str]) -> None:
        problem = self._check(scope, headers)
        if problem:
            status, detail = problem
            await _reject(send, status, detail)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [
                    (k, v) for k, v in SECURITY_HEADERS if k not in existing
                ]
            await send(message)

        await self.app(scope, receive, send_with_headers)

    def _check(self, scope: Scope, headers: dict[str, str]) -> tuple[int, str] | None:
        allowed = get_settings().allowed_host_set
        host = _hostname(headers.get("host", ""))
        if allowed is not None and host not in allowed:
            return 400, i18n.t("http.host_not_allowed", host=host or i18n.t("http.empty"))

        csrf = self._check_csrf(scope, headers, host, allowed)
        if csrf:
            return csrf
        return self._check_auth(scope, headers)

    @staticmethod
    def _check_auth(scope: Scope, headers: dict[str, str]) -> tuple[int, str] | None:
        if not auth.enabled():
            return None
        path = scope.get("path", "")
        if not path.startswith(PROTECTED_PREFIXES) or path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES):
            return None
        if auth.token_valid(auth.token_from_cookie_header(headers.get("cookie"))):
            return None
        return 401, i18n.t("auth.required")

    @staticmethod
    def _check_csrf(
        scope: Scope, headers: dict[str, str], host: str, allowed: set[str] | None
    ) -> tuple[int, str] | None:
        if scope["method"] in SAFE_METHODS:
            return None
        site = headers.get("sec-fetch-site")
        if site in ("cross-site", "same-site"):
            return 403, i18n.t("http.cross_site")
        origin = headers.get("origin")
        if origin is not None:
            o = _hostname(urlsplit(origin).netloc) if origin != "null" else ""
            if not o or (o not in allowed if allowed is not None else o != host):
                return 403, i18n.t("http.cross_origin")
        has_body = headers.get("content-length", "0") not in ("", "0") or "transfer-encoding" in headers
        if has_body:
            ctype = headers.get("content-type", "").split(";")[0].strip().lower()
            if ctype != "application/json":
                return 415, i18n.t("http.json_only")
        return None


async def _reject(send: Send, status: int, detail: str) -> None:
    import json

    body = json.dumps({"detail": detail}, ensure_ascii=False).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
            + SECURITY_HEADERS,
        }
    )
    await send({"type": "http.response.body", "body": body})
