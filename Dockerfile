FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# API code (env vars come from Railway, not from .env file)
COPY api/ ./api/
COPY pipeline/data/ ./pipeline/data/

EXPOSE 8000

# Honour Railway's $PORT env var; default to 8000 for local docker run
CMD ["sh", "-c", "uvicorn api.reason:app --host 0.0.0.0 --port ${PORT:-8000}"]
