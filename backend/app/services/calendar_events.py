from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    BookingRequestStatus,
    BookingStatus,
    PaymentStatus,
)
from app.models.location import Location
from app.models.membership_plan import MembershipPlan
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.calendar import (
    CalendarEvent,
    CalendarMember,
    CalendarResponse,
    CalendarSpace,
)
from app.services.space_archetypes import EXCLUSIVE_LEASE_ARCHETYPES, VIRTUAL
from app.services.space_type_registry import resolve_archetype


# Subscriptions only emit a calendar occupancy block for these archetypes
# (exclusive leases + virtual). Hot-desk and meeting-room memberships grant
# credits/access, not exclusive use.
SUBSCRIPTION_OCCUPANCY_ARCHETYPES = EXCLUSIVE_LEASE_ARCHETYPES | {VIRTUAL}

MAX_WINDOW_DAYS = 35
MAX_EVENTS = 2000


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _date_to_window_dt(d: date, edge: str) -> datetime:
    t = time(0, 0) if edge == "start" else time(23, 59, 59)
    return datetime.combine(d, t, tzinfo=timezone.utc)


def _name_for_user(user: User | None) -> str:
    if not user:
        return "Unknown"
    return user.full_name or user.first_name or user.email or "Unknown"


def build_calendar_events(
    db: Session,
    *,
    location_ids: Iterable[int],
    start: datetime,
    end: datetime,
    space_types: Optional[set[str]] = None,
    space_ids: Optional[set[int]] = None,
    statuses: Optional[set[str]] = None,
    include: Optional[set[str]] = None,
    user_id_filter: Optional[int] = None,
    max_window_days: int | None = MAX_WINDOW_DAYS,
) -> CalendarResponse:
    """Return unified calendar events across Booking + BookingRequest + Subscription.

    `statuses` filters on the prefixed `status` field (e.g. 'booking.confirmed'); when
    omitted, all statuses pass through.
    `include` may contain any of {'bookings', 'requests', 'subscriptions'}.
    `user_id_filter` (when set) restricts to events tied to that user — used by the
    member-side `/api/me/calendar`.
    """
    location_id_list = list(location_ids)
    if not location_id_list:
        return CalendarResponse(start=start, end=end, events=[], spaces=[], truncated=False)

    start = _as_utc(start)
    end = _as_utc(end)
    if end <= start:
        return CalendarResponse(start=start, end=end, events=[], spaces=[], truncated=False)

    if max_window_days is not None:
        max_end = start + timedelta(days=max_window_days)
        if end > max_end:
            end = max_end

    include = include or {"bookings", "requests", "subscriptions"}

    spaces_query = db.query(Space).filter(Space.location_id.in_(location_id_list))
    if space_types:
        spaces_query = spaces_query.filter(Space.space_type.in_(space_types))
    if space_ids:
        spaces_query = spaces_query.filter(Space.id.in_(space_ids))
    spaces = spaces_query.all()
    if not spaces:
        return CalendarResponse(start=start, end=end, events=[], spaces=[], truncated=False)

    space_by_id = {space.id: space for space in spaces}
    locations_by_id = {
        loc.id: loc
        for loc in db.query(Location).filter(Location.id.in_(location_id_list)).all()
    }

    space_id_set = set(space_by_id.keys())
    user_ids: set[int] = set()
    events: list[CalendarEvent] = []
    bookings: list[Booking] = []
    truncated = False

    def _location_for(space: Space) -> Location | None:
        return locations_by_id.get(space.location_id)

    def _make_member(user: User | None) -> CalendarMember:
        if not user:
            return CalendarMember(public_id="", name="Unknown", email="")
        return CalendarMember(
            public_id=user.public_id,
            name=_name_for_user(user),
            email=user.email or "",
        )

    def _push(event: CalendarEvent) -> bool:
        if statuses and event.status not in statuses:
            return True
        events.append(event)
        return len(events) < MAX_EVENTS

    if "bookings" in include:
        booking_q = db.query(Booking).filter(
            Booking.space_id.in_(space_id_set),
            Booking.start_datetime < end,
            Booking.end_datetime > start,
        )
        if user_id_filter is not None:
            booking_q = booking_q.filter(Booking.user_id == user_id_filter)
        bookings = booking_q.all()
        booking_ids = [b.id for b in bookings]
        booking_user_ids = {b.user_id for b in bookings}
        booking_request_ids = {b.booking_request_id for b in bookings if b.booking_request_id}
        user_ids.update(booking_user_ids)
        # Prefetch successful payments by booking_id for amount lookup.
        booking_payments: dict[int, Payment] = {}
        if booking_ids:
            payments = (
                db.query(Payment)
                .filter(
                    Payment.booking_id.in_(booking_ids),
                    Payment.status == PaymentStatus.SUCCEEDED,
                )
                .all()
            )
            for p in payments:
                booking_payments.setdefault(p.booking_id, p)
        booking_requests_by_id = (
            {
                req.id: req
                for req in db.query(BookingRequest)
                .filter(BookingRequest.id.in_(booking_request_ids))
                .all()
            }
            if booking_request_ids
            else {}
        )
        users_by_id = (
            {u.id: u for u in db.query(User).filter(User.id.in_(booking_user_ids)).all()}
            if booking_user_ids
            else {}
        )
        for booking in bookings:
            linked_request = (
                booking_requests_by_id.get(booking.booking_request_id)
                if booking.booking_request_id
                else None
            )
            if (
                booking.status == BookingStatus.PENDING
                and linked_request
                and linked_request.status in {BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED}
            ):
                continue
            space = space_by_id.get(booking.space_id)
            if not space:
                continue
            location = _location_for(space)
            if not location:
                continue
            payment = booking_payments.get(booking.id)
            event = CalendarEvent(
                kind="booking",
                public_id=booking.public_id,
                space_public_id=space.public_id,
                space_name=space.name,
                space_type=space.space_type,
                location_public_id=location.public_id,
                location_name=location.name,
                start=_as_utc(booking.start_datetime),
                end=_as_utc(booking.end_datetime),
                status=f"booking.{booking.status.value if booking.status else 'pending'}",
                payment_status=payment.status.value if payment else None,
                member=_make_member(users_by_id.get(booking.user_id)),
                amount_cents=(payment.amount_cents or payment.amount * 100) if payment else None,
                checked_in=booking.checked_in_at is not None,
                no_show=bool(booking.no_show),
                seats_requested=linked_request.seats_requested if linked_request else 1,
            )
            if not _push(event):
                truncated = True
                return CalendarResponse(
                    start=start, end=end, events=events, spaces=_render_spaces(spaces, locations_by_id), truncated=True
                )

    if "requests" in include:
        # Exclude APPROVED requests — they have produced a Booking row already.
        active_request_statuses = {BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED}
        request_q = db.query(BookingRequest).filter(
            BookingRequest.space_id.in_(space_id_set),
            BookingRequest.start_datetime < end,
            BookingRequest.end_datetime > start,
            BookingRequest.status.in_(active_request_statuses),
        )
        if user_id_filter is not None:
            request_q = request_q.filter(BookingRequest.user_id == user_id_filter)
        requests = request_q.all()
        request_user_ids = {r.user_id for r in requests}
        user_ids.update(request_user_ids)
        users_by_id = (
            {u.id: u for u in db.query(User).filter(User.id.in_(request_user_ids)).all()}
            if request_user_ids
            else {}
        )
        for req in requests:
            covering_booking = next(
                (
                    booking
                    for booking in bookings
                    if booking.user_id == req.user_id
                    and booking.space_id == req.space_id
                    and _as_utc(booking.start_datetime) == _as_utc(req.start_datetime)
                    and _as_utc(booking.end_datetime) == _as_utc(req.end_datetime)
                    and booking.status in {BookingStatus.PENDING, BookingStatus.CONFIRMED}
                ),
                None,
            )
            if covering_booking and (
                covering_booking.booking_request_id != req.id
                or covering_booking.status == BookingStatus.CONFIRMED
            ):
                continue
            space = space_by_id.get(req.space_id)
            if not space:
                continue
            location = _location_for(space)
            if not location:
                continue
            event = CalendarEvent(
                kind="request",
                public_id=req.public_id,
                space_public_id=space.public_id,
                space_name=space.name,
                space_type=space.space_type,
                location_public_id=location.public_id,
                location_name=location.name,
                start=_as_utc(req.start_datetime),
                end=_as_utc(req.end_datetime),
                status=f"request.{req.status.value if req.status else 'requested'}",
                payment_status=req.payment_status,
                member=_make_member(users_by_id.get(req.user_id)),
                amount_cents=None,
                request_kind=req.request_kind,
                seats_requested=req.seats_requested or 1,
            )
            if not _push(event):
                truncated = True
                return CalendarResponse(
                    start=start, end=end, events=events, spaces=_render_spaces(spaces, locations_by_id), truncated=True
                )

    if "subscriptions" in include:
        occupancy_space_ids = {
            sid
            for sid, sp in space_by_id.items()
            if resolve_archetype(None, sp.space_type) in SUBSCRIPTION_OCCUPANCY_ARCHETYPES
        }
        if occupancy_space_ids:
            window_start_date = start.date()
            window_end_date = end.date()
            sub_q = db.query(Subscription).filter(
                Subscription.space_id.in_(occupancy_space_ids),
                Subscription.status == "active",
                Subscription.start_date <= window_end_date,
            )
            if user_id_filter is not None:
                sub_q = sub_q.filter(Subscription.user_id == user_id_filter)
            subscriptions = sub_q.all()
            sub_user_ids = {s.user_id for s in subscriptions}
            user_ids.update(sub_user_ids)
            users_by_id = (
                {u.id: u for u in db.query(User).filter(User.id.in_(sub_user_ids)).all()}
                if sub_user_ids
                else {}
            )
            plan_ids = {s.membership_plan_id for s in subscriptions if s.membership_plan_id}
            plans_by_id = (
                {p.id: p for p in db.query(MembershipPlan).filter(MembershipPlan.id.in_(plan_ids)).all()}
                if plan_ids
                else {}
            )
            for sub in subscriptions:
                if sub.end_date is not None and sub.end_date < window_start_date:
                    continue
                space = space_by_id.get(sub.space_id)
                if not space:
                    continue
                location = _location_for(space)
                if not location:
                    continue
                effective_start = max(_date_to_window_dt(sub.start_date, "start"), start)
                effective_end_date = sub.end_date if sub.end_date else window_end_date
                effective_end = min(_date_to_window_dt(effective_end_date, "end"), end)
                if effective_end <= effective_start:
                    continue
                plan = plans_by_id.get(sub.membership_plan_id) if sub.membership_plan_id else None
                event = CalendarEvent(
                    kind="subscription",
                    public_id=sub.public_id,
                    space_public_id=space.public_id,
                    space_name=space.name,
                    space_type=space.space_type,
                    location_public_id=location.public_id,
                    location_name=location.name,
                    start=effective_start,
                    end=effective_end,
                    status=f"subscription.{sub.status}",
                    payment_status=None,
                    member=_make_member(users_by_id.get(sub.user_id)),
                    amount_cents=plan.price_cents if plan else None,
                    plan_name=plan.name if plan else None,
                    seats_requested=1,
                )
                if not _push(event):
                    truncated = True
                    return CalendarResponse(
                        start=start, end=end, events=events, spaces=_render_spaces(spaces, locations_by_id), truncated=True
                    )

    return CalendarResponse(
        start=start,
        end=end,
        events=events,
        spaces=_render_spaces(spaces, locations_by_id),
        truncated=truncated,
    )


def _render_spaces(spaces: list[Space], locations_by_id: dict[int, Location]) -> list[CalendarSpace]:
    out: list[CalendarSpace] = []
    for space in spaces:
        location = locations_by_id.get(space.location_id)
        if not location:
            continue
        out.append(
            CalendarSpace(
                public_id=space.public_id,
                name=space.name,
                space_type=space.space_type,
                location_public_id=location.public_id,
                location_name=location.name,
                location_timezone=location.timezone,
                capacity=space.capacity,
            )
        )
    return out
