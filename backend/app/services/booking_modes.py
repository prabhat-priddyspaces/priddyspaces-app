from sqlalchemy.orm import Session

from app.models.enums import BookingMode
from app.services.space_archetypes import (
    ARCHETYPE_BY_SYSTEM_KEY,
    VALID_BOOKING_MODES_BY_ARCHETYPE,
    space_type_key,
)
from app.services.space_type_registry import valid_booking_modes as _registry_valid_modes


# Back-compat static map keyed by space-type key, covering the built-in types.
# Plain-string keys compare/hash equal to the SpaceType enum members, so callers
# that look this up with either an enum member or a string both resolve.
VALID_BOOKING_MODES_BY_SPACE_TYPE: dict[str, set[BookingMode]] = {
    key: set(VALID_BOOKING_MODES_BY_ARCHETYPE[archetype])
    for key, archetype in ARCHETYPE_BY_SYSTEM_KEY.items()
}


RECURRING_BOOKING_MODES: set[BookingMode] = {
    BookingMode.MONTHLY_MEMBERSHIP,
    BookingMode.VIRTUAL_MEMBERSHIP,
    BookingMode.PRIVATE_OFFICE_LEASE,
    BookingMode.SUITE_LEASE,
}


def valid_booking_modes_for_space_type(space_type, db: Session | None = None) -> set[BookingMode]:
    """Valid booking modes for a space-type key (enum or string).

    Resolves built-in types from the static map without a DB hit; admin-created
    types are resolved from the registry when a session is provided.
    """
    key = space_type_key(space_type)
    modes = VALID_BOOKING_MODES_BY_SPACE_TYPE.get(key)
    if modes is not None:
        return set(modes)
    return _registry_valid_modes(db, key)


def is_mode_valid_for_space_type(space_type, mode: BookingMode, db: Session | None = None) -> bool:
    return mode in valid_booking_modes_for_space_type(space_type, db=db)
