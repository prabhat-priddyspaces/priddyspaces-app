from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, BookingStatus, PaymentStatus
from app.models.location import Location
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription


@dataclass
class MemberStats:
    total_bookings: int
    confirmed_bookings: int
    canceled_bookings: int
    no_shows: int
    open_requests: int
    total_revenue_cents: int
    active_subscriptions: int
    last_booking_at: Optional[datetime]
    first_booking_at: Optional[datetime]


def _location_ids_for_org(db: Session, organization_id: int) -> set[int]:
    rows = db.query(Location.id).filter(Location.organization_id == organization_id).all()
    return {row[0] for row in rows}


def _space_ids_for_locations(db: Session, location_ids: Iterable[int]) -> set[int]:
    location_ids = list(location_ids)
    if not location_ids:
        return set()
    rows = db.query(Space.id).filter(Space.location_id.in_(location_ids)).all()
    return {row[0] for row in rows}


def interacted_user_ids(db: Session, organization_id: int) -> set[int]:
    """Return the set of user_ids who have any BookingRequest, Booking, or Subscription
    tied to this organization. This is the "anyone-who-interacted" universe.
    """
    location_ids = _location_ids_for_org(db, organization_id)
    space_ids = _space_ids_for_locations(db, location_ids)
    user_ids: set[int] = set()
    if space_ids:
        for (uid,) in db.query(Booking.user_id).filter(Booking.space_id.in_(space_ids)).distinct():
            user_ids.add(uid)
        for (uid,) in (
            db.query(BookingRequest.user_id).filter(BookingRequest.space_id.in_(space_ids)).distinct()
        ):
            user_ids.add(uid)
    for (uid,) in (
        db.query(Subscription.user_id).filter(Subscription.tenant_id == organization_id).distinct()
    ):
        user_ids.add(uid)
    return user_ids


def compute_member_stats(db: Session, organization_id: int, user_id: int) -> MemberStats:
    location_ids = _location_ids_for_org(db, organization_id)
    space_ids = _space_ids_for_locations(db, location_ids)

    total_bookings = 0
    confirmed_bookings = 0
    canceled_bookings = 0
    no_shows = 0
    last_booking_at: Optional[datetime] = None
    first_booking_at: Optional[datetime] = None

    if space_ids:
        booking_q = db.query(Booking).filter(
            Booking.user_id == user_id, Booking.space_id.in_(space_ids)
        )
        total_bookings = booking_q.count()
        confirmed_bookings = booking_q.filter(Booking.status == BookingStatus.CONFIRMED).count()
        canceled_bookings = booking_q.filter(Booking.status == BookingStatus.CANCELED).count()
        no_shows = booking_q.filter(Booking.no_show.is_(True)).count()
        first_dt, last_dt = (
            db.query(func.min(Booking.start_datetime), func.max(Booking.start_datetime))
            .filter(Booking.user_id == user_id, Booking.space_id.in_(space_ids))
            .first()
        )
        first_booking_at = first_dt
        last_booking_at = last_dt

    open_requests = 0
    if space_ids:
        open_requests = (
            db.query(BookingRequest)
            .filter(
                BookingRequest.user_id == user_id,
                BookingRequest.space_id.in_(space_ids),
                BookingRequest.status.in_(
                    {BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED}
                ),
            )
            .count()
        )

    revenue_row = (
        db.query(func.coalesce(func.sum(Payment.amount_cents), 0), func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.user_id == user_id,
            Payment.tenant_id == organization_id,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .first()
    )
    revenue_cents = (revenue_row[0] or 0) or ((revenue_row[1] or 0) * 100)

    active_subscriptions = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user_id,
            Subscription.tenant_id == organization_id,
            Subscription.status == "active",
        )
        .count()
    )

    return MemberStats(
        total_bookings=total_bookings,
        confirmed_bookings=confirmed_bookings,
        canceled_bookings=canceled_bookings,
        no_shows=no_shows,
        open_requests=open_requests,
        total_revenue_cents=int(revenue_cents),
        active_subscriptions=active_subscriptions,
        last_booking_at=last_booking_at,
        first_booking_at=first_booking_at,
    )


def compute_member_stats_bulk(
    db: Session, organization_id: int, user_ids: Iterable[int]
) -> dict[int, MemberStats]:
    """Aggregate variant for the list endpoint. One query per metric per user is cheap
    at typical org scales (≤ a few hundred members); optimize later if needed.
    """
    return {uid: compute_member_stats(db, organization_id, uid) for uid in user_ids}
