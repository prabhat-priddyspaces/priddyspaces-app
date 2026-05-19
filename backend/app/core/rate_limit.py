from __future__ import annotations

import time
from threading import Lock

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings


SENSITIVE_POST_PREFIXES = (
    "/auth/login",
    "/auth/register",
    "/api/assistant/chat",
    "/api/guest/booking-requests",
    "/api/booking-requests",
    "/api/floor-plans/presign",
    "/api/media/presign",
    "/api/payment-methods",
    "/api/payments",
)

WEBHOOK_POST_PREFIXES = (
    "/api/webhooks",
    "/webhooks",
)


class FixedWindowRateLimiter:
    def __init__(self) -> None:
        self._lock = Lock()
        self._buckets: dict[tuple[str, str, int], int] = {}

    def allow(self, *, identifier: str, group: str, limit: int, window_seconds: int) -> bool:
        now = int(time.time())
        window = now // window_seconds
        key = (identifier, group, window)
        with self._lock:
            self._buckets = {bucket: count for bucket, count in self._buckets.items() if bucket[2] >= window - 1}
            count = self._buckets.get(key, 0) + 1
            self._buckets[key] = count
            return count <= limit


_limiter = FixedWindowRateLimiter()


def _client_identifier(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _group_for_request(request: Request) -> tuple[str, int] | None:
    if request.method.upper() != "POST":
        return None
    path = request.url.path
    if any(path.startswith(prefix) for prefix in WEBHOOK_POST_PREFIXES):
        return "webhook", settings.WEBHOOK_RATE_LIMIT_PER_MINUTE
    if any(path.startswith(prefix) for prefix in SENSITIVE_POST_PREFIXES):
        return "sensitive", settings.SENSITIVE_RATE_LIMIT_PER_MINUTE
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.API_RATE_LIMIT_ENABLED:
            return await call_next(request)

        group = _group_for_request(request)
        if not group:
            return await call_next(request)

        group_name, limit = group
        if limit <= 0:
            return await call_next(request)

        identifier = f"{_client_identifier(request)}:{group_name}"
        if not _limiter.allow(identifier=identifier, group=group_name, limit=limit, window_seconds=60):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": "60"},
            )

        return await call_next(request)
