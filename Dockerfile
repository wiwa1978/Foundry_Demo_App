FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS frontend-build

WORKDIR /src
COPY frontend/package*.json ./frontend/
RUN cd frontend \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-factor 2 \
    && npm config set fetch-retry-mintimeout 15000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && success=0 \
    && for attempt in 1 2 3 4 5; do \
         if npm ci; then success=1; break; fi; \
         echo "npm ci failed (attempt $attempt/5), retrying in 20s..." >&2; \
         sleep 20; \
       done \
    && [ "$success" = "1" ]
COPY frontend/ ./frontend/
COPY usecases_media/ ./usecases_media/
RUN cd frontend && npm run build

FROM python:3.12-slim@sha256:646fb0bca3dd3ea1bcc6feb72c17ed16eed6e10cffc732fcc1478bd3e7f02d7b

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get upgrade --yes \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home appuser

COPY requirements.lock ./
RUN pip install \
    --no-cache-dir \
    "https://files.pythonhosted.org/packages/af/72/ce3067ac31e214a66388159f8462ddb8c13dd00170f24d555a1f1ae8ee91/pypdf-6.15.0-py3-none-any.whl#sha256=14e001d6504822cb1ca9c7ed9a69bccb320f59b320730f55af804361abe4d5ee"
RUN pip install \
    --no-cache-dir \
    "https://files.pythonhosted.org/packages/f9/8a/cd4c9b02c10c563adfe78118310129641900e1cd6de888cfae2452072696/yt_dlp-2026.7.4-py3-none-any.whl#sha256=f11f2b11d5a8ac4059f9bdf29fa4407dc7c6bb00c5097e95ca22a7a9db518266"
RUN pip install \
    --index-url https://packagefeedproxy.microsoft.io/pypi/simple/ \
    --no-cache-dir \
    --require-hashes \
    -r requirements.lock

COPY app ./app
COPY usecases_agents ./usecases_agents
COPY usecases_media ./usecases_media
COPY pipelines ./pipelines
COPY data ./data
COPY --from=frontend-build /src/frontend/dist ./frontend/dist
RUN python -c "from app.api.static import FRONTEND_INDEX; assert FRONTEND_INDEX.is_file(), f'Frontend build missing at {FRONTEND_INDEX}'"

RUN mkdir -p data && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
