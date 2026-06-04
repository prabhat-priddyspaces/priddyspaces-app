"""Stable machine-readable error codes for API error responses.

Maps an HTTP status to a snake_case code (e.g. 404 -> "not_found", 409 ->
"conflict") so clients can branch on a stable identifier instead of parsing the
human-readable ``detail`` string. Error responses keep ``detail`` for backward
compatibility and add ``error_code`` + ``request_id``.
"""

from __future__ import annotations

from http import HTTPStatus

# Explicit, version-stable codes for the statuses the API actually returns.
# (HTTPStatus(422).name differs across Python versions — UNPROCESSABLE_ENTITY vs
# _CONTENT — so we pin the common ones rather than derive every code from stdlib.)
_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    410: "gone",
    422: "unprocessable_entity",
    429: "rate_limited",
    500: "internal_server_error",
    502: "bad_gateway",
    503: "service_unavailable",
}


def error_code_for_status(status_code: int) -> str:
    if status_code in _CODES:
        return _CODES[status_code]
    try:
        return HTTPStatus(status_code).name.lower()
    except ValueError:
        return f"http_{status_code}"
