"""Shared pagination dependency for list endpoints.

Use as ``pagination: Pagination = Depends(pagination_params)`` and apply
``.order_by(...).offset(pagination.offset).limit(pagination.limit)`` to the
query. Responses stay plain lists (no envelope change); the cap just bounds
previously-unbounded endpoints.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


@dataclass(frozen=True)
class Pagination:
    offset: int
    limit: int


def pagination_params(
    offset: int = Query(0, ge=0, description="Number of items to skip."),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Maximum number of items to return."),
) -> Pagination:
    return Pagination(offset=offset, limit=limit)
