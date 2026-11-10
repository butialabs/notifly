from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app import auth, i18n
from app.config import get_settings

router = APIRouter(prefix="/api/auth")


class LoginIn(BaseModel):
    password: str = Field(max_length=1024)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "?"


def _secure(request: Request) -> bool:
    # Behind a reverse proxy the request may arrive as http, so an https
    # NOTIFLY_PUBLIC_URL also turns on Secure.
    return request.url.scheme == "https" or get_settings().public_url.lower().startswith("https://")


@router.get("/status")
def status(request: Request):
    on = auth.enabled()
    token = request.cookies.get(auth.COOKIE_NAME)
    return {"enabled": on, "authenticated": (not on) or auth.token_valid(token)}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    if not auth.enabled():
        return {"enabled": False, "authenticated": True}
    ip = _client_ip(request)
    wait = auth.retry_after(ip)
    if wait:
        raise HTTPException(429, i18n.t("auth.too_many", minutes=wait // 60 + 1), headers={"Retry-After": str(wait)})
    if not auth.password_matches(body.password):
        auth.record_failure(ip)
        raise HTTPException(401, i18n.t("auth.wrong_password"))
    auth.reset_failures(ip)
    response.set_cookie(
        auth.COOKIE_NAME,
        auth.make_token(),
        max_age=get_settings().session_days * 86400,
        httponly=True,
        samesite="strict",
        secure=_secure(request),
        path="/",
    )
    return {"enabled": True, "authenticated": True}


@router.post("/logout")
def logout(request: Request, response: Response):
    response.delete_cookie(auth.COOKIE_NAME, path="/", httponly=True, samesite="strict", secure=_secure(request))
    return {"enabled": auth.enabled(), "authenticated": not auth.enabled()}
