"""Service-level behavior for the space-type archetype layer.

These run without a DB session, exercising the static built-in resolution path
and guarding the str-column regression (a plain-string space_type must still
compare and resolve like the old enum).
"""
from app.models.space import Space
from app.services.booking_modes import (
    is_mode_valid_for_space_type,
    valid_booking_modes_for_space_type,
)
from app.models.enums import BookingMode
from app.services.booking_inventory import instant_booking_allowed, is_shared_desk_day_pass
from app.services.space_type_registry import resolve_archetype


def _space(space_type: str) -> Space:
    return Space(space_type=space_type, capacity=4)


def test_builtin_keys_resolve_to_expected_archetypes():
    expected = {
        "private_office": "private_office_lease",
        "shared_desk": "desk_pool",
        "conference_room": "room_hourly",
        "virtual_office": "virtual",
        "suite": "suite_lease",
        "event_space": "room_hourly",
        "business_address": "virtual",
    }
    for key, archetype in expected.items():
        assert resolve_archetype(None, key) == archetype


def test_new_types_inherit_existing_booking_modes():
    assert valid_booking_modes_for_space_type("event_space") == {
        BookingMode.HOURLY,
        BookingMode.DAY_PASS,
    }
    assert valid_booking_modes_for_space_type("business_address") == {
        BookingMode.VIRTUAL_MEMBERSHIP
    }
    assert is_mode_valid_for_space_type("event_space", BookingMode.HOURLY)
    assert not is_mode_valid_for_space_type("business_address", BookingMode.HOURLY)


def test_string_column_still_behaves_like_shared_desk():
    # Regression: after the Enum->String migration, a plain-string space_type
    # must still pool and instant-book as a shared desk.
    desk = _space("shared_desk")
    assert is_shared_desk_day_pass(desk, full_day=True)
    assert instant_booking_allowed(desk, booking_mode="day_pass", full_day=True)


def test_event_space_is_instant_bookable_like_a_room():
    event = _space("event_space")
    assert instant_booking_allowed(event, booking_mode="hourly", full_day=False)


def test_lease_types_are_not_instant_bookable():
    assert not instant_booking_allowed(_space("private_office"), booking_mode=None, full_day=False)
    assert not instant_booking_allowed(_space("business_address"), booking_mode=None, full_day=False)
