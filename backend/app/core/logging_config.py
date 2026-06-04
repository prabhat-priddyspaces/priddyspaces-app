"""Structured logging with per-request context.

When ``LOG_JSON`` is enabled (recommended in staging/production) logs are emitted
as single-line JSON enriched with ``request_id`` / ``user_id`` / ``tenant_id``
pulled from contextvars, so the logs for one request can be correlated across the
booking -> payment -> loyalty chain. Locally it stays human-readable.

The request id is set by the ASGI middleware in app/main.py; user/tenant are
bound by the auth layer once the caller is resolved.
"""

from __future__ import annotations

import json
import logging
import uuid
from contextvars import ContextVar
from typing import Any

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[int | None] = ContextVar("user_id", default=None)
tenant_id_ctx: ContextVar[int | None] = ContextVar("tenant_id", default=None)

_CONTEXT_FIELDS = ("request_id", "user_id", "tenant_id")

# Standard LogRecord attributes; anything else on a record is a structured extra
# passed via ``logger.info(msg, extra={...})``.
_STD_ATTRS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {
    "message",
    "asctime",
    "taskName",
    *_CONTEXT_FIELDS,
}


def bind_log_context(*, user_id: int | None = None, tenant_id: int | None = None) -> None:
    """Attach the resolved caller to the current request's log context."""
    if user_id is not None:
        user_id_ctx.set(user_id)
    if tenant_id is not None:
        tenant_id_ctx.set(tenant_id)


class RequestContextFilter(logging.Filter):
    """Copy the request-scoped contextvars onto every LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        record.user_id = user_id_ctx.get()
        record.tenant_id = tenant_id_ctx.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in _CONTEXT_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        for key, value in record.__dict__.items():
            if key not in _STD_ATTRS and key not in payload:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(*, json_logs: bool, level: str = "INFO") -> None:
    """Install a single root handler (JSON or human-readable) with request context."""
    root = logging.getLogger()
    root.setLevel(level)
    for handler in list(root.handlers):
        root.removeHandler(handler)
    handler = logging.StreamHandler()
    handler.addFilter(RequestContextFilter())
    if json_logs:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s [req=%(request_id)s] %(message)s")
        )
    root.addHandler(handler)


def log_event(logger: logging.Logger, event: str, *, level: int = logging.INFO, **fields: Any) -> None:
    """Emit a structured money-path/audit event (e.g. log_event(logger, "charge_succeeded", amount_cents=5000))."""
    logger.log(level, event, extra={"event": event, **fields})


class RequestContextMiddleware:
    """Pure-ASGI middleware that sets a request-id contextvar (visible to every
    log emitted during the request) and echoes it back as X-Request-ID.

    ASGI rather than Starlette's BaseHTTPMiddleware so the contextvar reliably
    propagates to the route handler within the same task.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope.get("headers") or {}).get(b"x-request-id", b"").decode()
        request_id = incoming or uuid.uuid4().hex
        token = request_id_ctx.set(request_id)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_ctx.reset(token)
