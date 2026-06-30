"""Runtime helpers for the space-type registry.

Resolves a space-type ``key`` to its behavior archetype (falling back to the
static built-in map when no DB row exists) and exposes seeding + lookup helpers
used by the API, booking engine, marketplace, tests, and demo seed data.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.enums import BookingMode
from app.models.space_type import SpaceTypeRegistry
from app.services.space_archetypes import (
    ARCHETYPE_BY_SYSTEM_KEY,
    SYSTEM_SPACE_TYPES,
    VALID_BOOKING_MODES_BY_ARCHETYPE,
    space_type_key,
)

# Default marketplace category → representative built-in key, used as a fallback
# when the registry has not been seeded (e.g. very old data).
STATIC_CATEGORY_DEFAULT: dict[str, str] = {
    "coworking": "shared_desk",
    "private_office": "private_office",
    "meeting_room": "conference_room",
}

VALID_MARKETPLACE_CATEGORIES: set[str] = set(STATIC_CATEGORY_DEFAULT)


def seed_system_space_types(session: Session) -> None:
    """Idempotently insert the built-in space types.

    Existing rows are left untouched (admins may have edited labels / enabled
    flags); only missing built-ins are inserted. Safe to call on every startup
    and from test fixtures.
    """
    existing = {row.key for row in session.query(SpaceTypeRegistry.key).all()}
    created = False
    for spec in SYSTEM_SPACE_TYPES:
        if spec["key"] in existing:
            continue
        session.add(SpaceTypeRegistry(**spec))
        created = True
    if created:
        session.flush()


def resolve_archetype(db: Session | None, key) -> str | None:
    """Resolve a space-type key to its archetype.

    Checks the static built-in map first (no DB hit for the seven built-ins),
    then the registry for admin-created types.
    """
    resolved_key = space_type_key(key)
    archetype = ARCHETYPE_BY_SYSTEM_KEY.get(resolved_key)
    if archetype is not None:
        return archetype
    if db is None:
        return None
    row = (
        db.query(SpaceTypeRegistry)
        .filter(SpaceTypeRegistry.key == resolved_key)
        .first()
    )
    return row.archetype if row else None


def valid_booking_modes(db: Session | None, key) -> set[BookingMode]:
    archetype = resolve_archetype(db, key)
    if archetype is None:
        return set()
    return set(VALID_BOOKING_MODES_BY_ARCHETYPE.get(archetype, set()))


def list_enabled_space_types(db: Session) -> list[SpaceTypeRegistry]:
    return (
        db.query(SpaceTypeRegistry)
        .filter(SpaceTypeRegistry.is_enabled.is_(True))
        .order_by(SpaceTypeRegistry.sort_order.asc(), SpaceTypeRegistry.id.asc())
        .all()
    )


def space_type_is_enabled(db: Session, key) -> bool:
    resolved_key = space_type_key(key)
    row = (
        db.query(SpaceTypeRegistry)
        .filter(SpaceTypeRegistry.key == resolved_key)
        .first()
    )
    if row is None:
        # No registry row: allow built-in types (registry may not be seeded yet),
        # reject unknown keys.
        return resolved_key in ARCHETYPE_BY_SYSTEM_KEY
    return bool(row.is_enabled)


def category_space_type_keys(db: Session, category: str) -> list[str]:
    """Enabled space-type keys whose marketplace_category matches ``category``."""
    rows = (
        db.query(SpaceTypeRegistry)
        .filter(
            SpaceTypeRegistry.marketplace_category == category,
            SpaceTypeRegistry.is_enabled.is_(True),
        )
        .order_by(SpaceTypeRegistry.sort_order.asc())
        .all()
    )
    keys = [row.key for row in rows]
    if keys:
        return keys
    fallback = STATIC_CATEGORY_DEFAULT.get(category)
    return [fallback] if fallback else []
