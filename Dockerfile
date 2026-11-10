FROM --platform=$BUILDPLATFORM node:26-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NOTIFLY_DATA_DIR=/data \
    TZ=UTC
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist ./static

RUN groupadd --system --gid 10001 notifly \
 && useradd --system --uid 10001 --gid notifly --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin notifly \
 && mkdir -p /data && chown notifly:notifly /data
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD ["python", "-c", "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers"]
