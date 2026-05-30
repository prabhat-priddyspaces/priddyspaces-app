from app.models.enums import BookingMode, SpaceType


VALID_BOOKING_MODES_BY_SPACE_TYPE: dict[SpaceType, set[BookingMode]] = {
    SpaceType.PRIVATE_OFFICE: {BookingMode.PRIVATE_OFFICE_LEASE},
    SpaceType.SUITE: {BookingMode.SUITE_LEASE},
    SpaceType.SHARED_DESK: {BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP},
    SpaceType.CONFERENCE_ROOM: {BookingMode.HOURLY, BookingMode.DAY_PASS},
    SpaceType.VIRTUAL_OFFICE: {BookingMode.VIRTUAL_MEMBERSHIP},
}


RECURRING_BOOKING_MODES: set[BookingMode] = {
    BookingMode.MONTHLY_MEMBERSHIP,
    BookingMode.VIRTUAL_MEMBERSHIP,
    BookingMode.PRIVATE_OFFICE_LEASE,
    BookingMode.SUITE_LEASE,
}


def is_mode_valid_for_space_type(space_type: SpaceType, mode: BookingMode) -> bool:
    return mode in VALID_BOOKING_MODES_BY_SPACE_TYPE.get(space_type, set())
