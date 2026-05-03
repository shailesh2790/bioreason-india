FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy API code only (not pipelines/data)
COPY api/ ./api/
COPY .env.production .env 2>/dev/null || true

EXPOSE 8000

CMD ["uvicorn", "api.reason:app", "--host", "0.0.0.0", "--port", "8000"]
