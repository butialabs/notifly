from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NOTIFLY_", env_file=".env", extra="ignore")

    data_dir: Path = Path("./data")
    currency: str = "BRL"
    language: str = "pt-BR"
    country: str = "BR"
    timezone: str = "America/Sao_Paulo"
    # Proxy for requests to Google, e.g. https://user:pass@host:8443
    proxy_url: str | None = None

    # Scheduler
    scheduler_enabled: bool = True
    default_check_interval_minutes: int = 360
    min_check_interval_minutes: int = 15
    min_seconds_between_searches: float = 4.0
    max_concurrent_checks: int = 1
    offers_kept_per_snapshot: int = 15
    keep_offers_for_last_snapshots: int = 30
    # minimum gap between manual "Check now" runs of the same flight
    manual_check_cooldown_seconds: int = 120

    # Each flight is a scheduler job and each rule multiplies notifications
    max_watches: int = 300
    max_rules: int = 200
    max_channels: int = 50
    # Quick search: longest wait in the throttle queue before answering 429
    search_queue_max_seconds: float = 30.0

    # Used in notification links
    public_url: str = "http://localhost:8000"
    # Accepted Host headers, comma separated (DNS rebinding protection). Empty: host of
    # NOTIFLY_PUBLIC_URL + localhost/127.0.0.1/::1. "*" disables the check.
    allowed_hosts: str = ""
    # Empty: no login, so anyone who reaches the port has full access
    password: SecretStr | None = None
    session_days: int = Field(default=30, ge=1, le=365)

    # /docs, /redoc and /openapi.json; off by default because they load CDN scripts on the app's origin
    api_docs: bool = False

    @property
    def db_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'notifly.db').as_posix()}"

    @property
    def allowed_host_set(self) -> set[str] | None:
        """Accepted hosts (no port, lowercase); None means any host."""
        raw = [h.strip().lower() for h in self.allowed_hosts.split(",") if h.strip()]
        if "*" in raw:
            return None
        hosts = set(raw) or {"localhost", "127.0.0.1", "::1"}
        if not raw:
            pub = urlsplit(self.public_url).hostname
            if pub:
                hosts.add(pub.lower())
        return hosts


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    try:
        # The database holds channel URLs (tokens, passwords): owner only.
        s.data_dir.chmod(0o700)
    except OSError:
        pass
    return s
