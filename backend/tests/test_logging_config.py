"""Tests for structured logging + request context (Phase 2)."""

import asyncio
import io
import json
import logging

import pytest

from app.core.logging_config import (
    JsonFormatter,
    RequestContextFilter,
    RequestContextMiddleware,
    configure_logging,
    log_event,
    request_id_ctx,
    tenant_id_ctx,
    user_id_ctx,
)


@pytest.fixture(autouse=True)
def _reset_context():
    request_id_ctx.set(None)
    user_id_ctx.set(None)
    tenant_id_ctx.set(None)
    yield
    request_id_ctx.set(None)
    user_id_ctx.set(None)
    tenant_id_ctx.set(None)


def _json_logger(name: str) -> tuple[logging.Logger, io.StringIO]:
    stream = io.StringIO()
    logger = logging.getLogger(name)
    logger.handlers.clear()
    logger.propagate = False
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(stream)
    handler.addFilter(RequestContextFilter())
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    return logger, stream


def test_json_formatter_includes_context_and_extras():
    request_id_ctx.set("req-1")
    user_id_ctx.set(42)
    logger, stream = _json_logger("test.json.extras")

    log_event(logger, "charge_succeeded", amount_cents=5000, booking_public_id="bk_1")

    payload = json.loads(stream.getvalue().strip())
    assert payload["message"] == "charge_succeeded"
    assert payload["event"] == "charge_succeeded"
    assert payload["amount_cents"] == 5000
    assert payload["booking_public_id"] == "bk_1"
    assert payload["request_id"] == "req-1"
    assert payload["user_id"] == 42
    assert payload["level"] == "INFO"
    assert payload["logger"] == "test.json.extras"


def test_json_formatter_omits_unset_context():
    logger, stream = _json_logger("test.json.nocontext")
    logger.info("hello")
    payload = json.loads(stream.getvalue().strip())
    assert "request_id" not in payload
    assert "user_id" not in payload
    assert payload["message"] == "hello"


def test_request_context_filter_injects_contextvars():
    request_id_ctx.set("req-9")
    record = logging.LogRecord("n", logging.INFO, "p", 1, "m", (), None)
    RequestContextFilter().filter(record)
    assert record.request_id == "req-9"
    assert record.user_id is None


def test_configure_logging_installs_single_json_handler():
    configure_logging(json_logs=True, level="INFO")
    root = logging.getLogger()
    json_handlers = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
    assert len(json_handlers) == 1
    # Re-running does not stack handlers.
    configure_logging(json_logs=True, level="INFO")
    assert len([h for h in logging.getLogger().handlers if isinstance(h.formatter, JsonFormatter)]) == 1


def _run_middleware(scope_headers: list[tuple[bytes, bytes]]) -> tuple[dict, list]:
    captured: dict = {}

    async def dummy_app(scope, receive, send):
        captured["request_id_during"] = request_id_ctx.get()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    sent: list = []

    async def receive():
        return {"type": "http.request"}

    async def send(message):
        sent.append(message)

    middleware = RequestContextMiddleware(dummy_app)
    asyncio.run(middleware({"type": "http", "headers": scope_headers}, receive, send))
    return captured, sent


def test_request_context_middleware_generates_and_echoes_request_id():
    captured, sent = _run_middleware([])
    assert captured["request_id_during"]  # set during the request
    assert request_id_ctx.get() is None  # reset afterwards

    start = next(m for m in sent if m["type"] == "http.response.start")
    headers = dict(start["headers"])
    assert headers[b"x-request-id"].decode() == captured["request_id_during"]


def test_request_context_middleware_honors_incoming_request_id():
    captured, sent = _run_middleware([(b"x-request-id", b"abc123")])
    assert captured["request_id_during"] == "abc123"
    start = next(m for m in sent if m["type"] == "http.response.start")
    assert dict(start["headers"])[b"x-request-id"] == b"abc123"
