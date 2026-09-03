FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY server.py .

# SQLite DB lives in container — auto-seed handles cold starts
ENV SIBYL_DB_PATH=/app/data/sibyl-memory.db

RUN mkdir -p /app/data

# Railway injects $PORT — bind to it
CMD gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 1 --timeout 120 server:app
