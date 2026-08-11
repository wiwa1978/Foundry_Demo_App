FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS frontend-build

WORKDIR /src
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
COPY usecases_media/ ./usecases_media/
RUN cd frontend && npm run build

FROM python:3.12-slim@sha256:646fb0bca3dd3ea1bcc6feb72c17ed16eed6e10cffc732fcc1478bd3e7f02d7b

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home appuser

COPY requirements.lock ./
RUN pip install \
    --no-cache-dir \
    "https://files.pythonhosted.org/packages/af/72/ce3067ac31e214a66388159f8462ddb8c13dd00170f24d555a1f1ae8ee91/pypdf-6.15.0-py3-none-any.whl#sha256=14e001d6504822cb1ca9c7ed9a69bccb320f59b320730f55af804361abe4d5ee"
RUN pip install \
    --no-cache-dir \
    "https://files.pythonhosted.org/packages/cd/13/5093bcb954878e50f7217fd2ab94282b53934022e4e4a03265582da83bf5/yt_dlp-2026.3.17-py3-none-any.whl#sha256=32992db94303a8a5d211a183f2174834fe7f8c29d83ed2e7a324eae97a8f26d8"
RUN pip install \
    --index-url https://packagefeedproxy.microsoft.io/pypi/simple/ \
    --no-cache-dir \
    --require-hashes \
    -r requirements.lock

COPY app ./app
COPY usecases_media ./usecases_media
COPY --from=frontend-build /src/frontend/dist ./frontend/dist

RUN mkdir -p data && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
