FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY server.py .

# SQLite DB lives in container — auto-seed handles cold starts
ENV SIBYL_DB_PATH=/app/data/sibyl-memory.db
ENV SIBYL_BRIDGE_PORT=10000

RUN mkdir -p /app/data

EXPOSE 10000

CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--workers", "1", "--timeout", "120", "server:app"]
