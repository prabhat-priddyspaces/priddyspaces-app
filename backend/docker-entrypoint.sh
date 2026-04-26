#!/usr/bin/env sh
set -e

python - <<'PY'
import os
import socket
import time
from urllib.parse import urlparse

url = os.getenv("DATABASE_URL", "")
host = "db"
port = 5432
if url:
    parsed = urlparse(url)
    if parsed.hostname:
        host = parsed.hostname
    if parsed.port:
        port = parsed.port

deadline = time.time() + 60
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit(f"Database not reachable at {host}:{port}")
PY

python -m alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
