from datetime import datetime, date, time
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import BookingStatus, BookingRequestStatus
from app.models.subscription import Subscription


def booking_overlaps(db: Session, space_id: int, start: datetime, end: datetime) -> bool:
    return (
        db.query(Booking)
        .filter(
            Booking.space_id == space_id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
            Booking.start_datetime < end,
            Booking.end_datetime > start
        )
        .first()
        is not None
    )


def booking_request_overlaps(db: Session, space_id: int, start: datetime, end: datetime) -> bool:
    return (
        db.query(BookingRequest)
        .filter(
            BookingRequest.space_id == space_id,
            BookingRequest.status == BookingRequestStatus.REQUESTED,
            BookingRequest.start_datetime < end,
            BookingRequest.end_datetime > start
        )
        .first()
        is not None
    )


def booking_overlaps_date(db: Session, space_id: int, start: date, end: date | None) -> bool:
    end_date = end or start
    start_dt = datetime.combine(start, time.min)
    end_dt = datetime.combine(end_date, time.max)
    return booking_overlaps(db, space_id, start_dt, end_dt)


_EXCLUSIVE_BOOKING_MODES = {"private_office_lease", "suite_lease"}


def subscription_overlaps(db: Session, space_id: int, start: date, end: date | None) -> bool:
    """True iff there's an *exclusive* subscription on this space covering the window.

    Office/suite leases block other bookings (the space is reserved for that
    customer). Coworking memberships, day passes, and virtual memberships do
    not — multiple customers can share the same space concurrently.

    Legacy subscriptions (no booking_mode) keep the pre-membership-flow behavior
    of blocking, so existing tests/data don't change semantics.
    """
    end_date = end or date.max
    return (
        db.query(Subscription)
        .filter(
            Subscription.space_id == space_id,
            Subscription.status.in_(["active", "past_due"]),
            Subscription.start_date <= end_date,
            or_(Subscription.end_date.is_(None), Subscription.end_date >= start),
            or_(
                Subscription.booking_mode.is_(None),
                Subscription.booking_mode.in_(_EXCLUSIVE_BOOKING_MODES),
            ),
        )
        .first()
        is not None
    )
