import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import auth, scheduler
from app.api.auth_routes import router as auth_router
from app.api.routes import router
from app.config import get_settings
from app.db import init_db
from app.security import SecurityMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("notifly")

STATIC_DIR = Path(__file__).resolve().parents[1] / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    # New files (database, -wal/-shm) are readable by the process owner only.
    os.umask(0o077)
    init_db()
    if not auth.enabled():
        log.warning(
            "NOTIFLY_PASSWORD não definida: o app está sem login e quem alcançar a porta tem acesso total, "
            "inclusive aos tokens dos canais. Defina uma senha ou proteja o acesso no proxy reverso."
        )
    scheduler.start()
    yield
    scheduler.shutdown()


_docs = get_settings().api_docs
app = FastAPI(
    title="Notifly",
    lifespan=lifespan,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)
app.add_middleware(SecurityMiddleware)
app.include_router(auth_router)
app.include_router(router)

if (STATIC_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        f = STATIC_DIR / path
        if path and f.is_file() and STATIC_DIR in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(STATIC_DIR / "index.html")
