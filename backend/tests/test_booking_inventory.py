from datetime import datetime, time, timezone

import pytest
from fastapi import HTTPException

from app.models.booking import Booking
from app.models.enums import (
    AvailabilityStatus,
    BookingGranularity,
    BookingStatus,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.models.user import User
from app.services.booking_inventory import expand_occurrences, validate_occurrences_available


def _seed_conference_room(db_session) -> tuple[Location, Space]:
    owner = User(
        email="inventory-owner@example.com",
        auth_subject="sub-inventory-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    org = Organization(
        name="Inventory Org",
        owner_id=owner.id,
        review_status=OrganizationReviewStatus.APPROVED,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
        booking_granularity=BookingGranularity.MIN_120,
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Conference",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        price_daily=350,
        price_hourly=40,
        availability_status=AvailabilityStatus.AVAILABLE,
        availability_start_time=time(9, 0),
        availability_end_time=time(18, 30),
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)
    return location, space


def _seed_shared_desk(db_session) -> tuple[Location, Space]:
    location, space = _seed_conference_room(db_session)
    space.name = "Desk"
    space.space_type = SpaceType.SHARED_DESK
    space.capacity = 4
    space.price_daily = 35
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)
    return location, space


def _occurrences(
    location: Location,
    space: Space,
    *,
    start_hour: int,
    start_minute: int,
    end_hour: int,
    end_minute: int,
):
    return expand_occurrences(
        start_datetime=datetime(2026, 6, 1, start_hour, start_minute, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 6, 1, end_hour, end_minute, tzinfo=timezone.utc),
        location=location,
        space=space,
    )


def test_full_day_booking_skips_hourly_granularity(db_session):
    location, space = _seed_conference_room(db_session)
    occurrences = _occurrences(location, space, start_hour=9, start_minute=0, end_hour=18, end_minute=30)

    validate_occurrences_available(
        db_session,
        space=space,
        location=location,
        occurrences=occurrences,
        booking_mode="day_pass",
        full_day=True,
    )


def test_hourly_booking_still_requires_granularity_aligned_end(db_session):
    location, space = _seed_conference_room(db_session)
    occurrences = _occurrences(location, space, start_hour=9, start_minute=0, end_hour=18, end_minute=30)

    with pytest.raises(HTTPException) as exc:
        validate_occurrences_available(
            db_session,
            space=space,
            location=location,
            occurrences=occurrences,
            booking_mode="hourly",
            full_day=False,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "End time must align to booking granularity"


def test_full_day_booking_must_match_published_availability(db_session):
    location, space = _seed_conference_room(db_session)
    occurrences = _occurrences(location, space, start_hour=10, start_minute=0, end_hour=18, end_minute=30)

    with pytest.raises(HTTPException) as exc:
        validate_occurrences_available(
            db_session,
            space=space,
            location=location,
            occurrences=occurrences,
            booking_mode="day_pass",
            full_day=True,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "All-day bookings must match published availability"


def test_shared_desk_day_pass_skips_granularity_without_full_window(db_session):
    location, space = _seed_shared_desk(db_session)
    occurrences = _occurrences(location, space, start_hour=9, start_minute=0, end_hour=11, end_minute=0)

    validate_occurrences_available(
        db_session,
        space=space,
        location=location,
        occurrences=occurrences,
        booking_mode="day_pass",
        full_day=True,
        seats_requested=1,
    )


def test_full_day_booking_still_rejects_existing_booking_conflict(db_session):
    location, space = _seed_conference_room(db_session)
    db_session.add(
        Booking(
            user_id=1,
            tenant_id=space.tenant_id,
            space_id=space.id,
            start_datetime=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 6, 1, 13, 0, tzinfo=timezone.utc),
            inventory_start_datetime=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
            inventory_end_datetime=datetime(2026, 6, 1, 13, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        )
    )
    db_session.commit()
    occurrences = _occurrences(location, space, start_hour=9, start_minute=0, end_hour=18, end_minute=30)

    with pytest.raises(HTTPException) as exc:
        validate_occurrences_available(
            db_session,
            space=space,
            location=location,
            occurrences=occurrences,
            booking_mode="day_pass",
            full_day=True,
        )

    assert exc.value.status_code == 409
    assert exc.value.detail == "Booking overlaps existing booking"
