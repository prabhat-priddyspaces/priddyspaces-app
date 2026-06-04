"""Tests for the consistent API error envelope (Phase 5a)."""

import pytest

from app.core.errors import error_code_for_status


@pytest.mark.parametrize(
    "status_code,expected",
    [
        (400, "bad_request"),
        (401, "unauthorized"),
        (403, "forbidden"),
        (404, "not_found"),
        (409, "conflict"),
        (410, "gone"),
        (422, "unprocessable_entity"),
        (429, "rate_limited"),
        (500, "internal_server_error"),
        (503, "service_unavailable"),
        (599, "http_599"),
    ],
)
def test_error_code_for_status(status_code, expected):
    assert error_code_for_status(status_code) == expected


def test_error_response_includes_code_and_request_id(client_factory):
    client = client_factory({})

    response = client.get("/api/this-route-does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error_code"] == "not_found"
    assert "detail" in body  # kept for backward compatibility
    assert "request_id" in body
    # The request-context middleware echoes the id as a header too.
    assert response.headers.get("x-request-id")
    assert body["request_id"] == response.headers["x-request-id"]


def test_deprecated_create_booking_returns_410_gone(client_factory):
    client = client_factory({})

    response = client.post("/api/bookings", json={})

    assert response.status_code == 410
    body = response.json()
    assert body["error_code"] == "gone"
    assert body["detail"] == "Use /api/booking-requests"
