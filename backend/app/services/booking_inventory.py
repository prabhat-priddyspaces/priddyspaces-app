from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    SpaceType,
)
from app.models.location import Location
from app.models.space import Space
from app.models.subscription import Subscription


MAX_RECURRENCE_OCCURRENCES = 52
INSTANT_SPACE_TYPES = {SpaceType.CONFERENCE_ROOM, SpaceType.SHARED_DESK}
HIGH_VALUE_SPACE_TYPES = {SpaceType.PRIVATE_OFFICE, SpaceType.SUITE}


@dataclass(frozen=True)
class InventoryOccurrence:
    sequence: int
    start_datetime: datetime
    end_datetime: datetime
    inventory_start_datetime: datetime
    inventory_end_datetime: datetime


def resolve_tz(name: str | None) -> ZoneInfo:
    if not name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def as_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def instant_booking_allowed(space: Space, *, booking_mode: str | None, full_day: bool) -> bool:
    if space.space_type in HIGH_VALUE_SPACE_TYPES:
        return False
    if space.space_type == SpaceType.CONFERENCE_ROOM:
        return True
    if space.space_type == SpaceType.SHARED_DESK and (full_day or booking_mode == "day_pass"):
        return True
    return False


def _open_window(location_date: date, space: Space, tz: ZoneInfo) -> tuple[datetime, datetime] | None:
    open_t = space.availability_start_time or time(9, 0)
    close_t = space.availability_end_time or time(18, 0)
    if close_t <= open_t:
        return None
    return (
        datetime.combine(location_date, open_t, tzinfo=tz),
        datetime.combine(location_date, close_t, tzinfo=tz),
    )


def _minutes_between(start: datetime, end: datetime) -> int:
    return int((end - start).total_seconds() // 60)


def _granularity_minutes(location: Location) -> int:
    raw = getattr(location.booking_granularity, "value", location.booking_granularity)
    return {"30m": 30, "60m": 60, "120m": 120, "daily": 24 * 60}.get(raw, 60)


def _add_months_clamped(dt: datetime, months: int) -> datetime:
    import calendar

    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def expand_occurrences(
    *,
    start_datetime: datetime,
    end_datetime: datetime,
    location: Location,
    space: Space,
    recurrence_frequency: str | None = None,
    recurrence_interval: int | None = None,
    recurrence_count: int | None = None,
    recurrence_until_date: date | None = None,
) -> list[InventoryOccurrence]:
    start_utc = as_utc(start_datetime)
    end_utc = as_utc(end_datetime)
    if end_utc <= start_utc:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    tz = resolve_tz(location.timezone)
    start_local = start_utc.astimezone(tz)
    end_local = end_utc.astimezone(tz)
    duration = end_local - start_local
    if duration <= timedelta(0):
        raise HTTPException(status_code=400, detail="End time must be after start time")

    interval = max(1, recurrence_interval or 1)
    frequency = recurrence_frequency or None
    if frequency is None:
        count = 1
    else:
        if frequency not in {"weekly", "monthly"}:
            raise HTTPException(status_code=400, detail="Recurring bookings support weekly or monthly only")
        if recurrence_count is None and recurrence_until_date is None:
            raise HTTPException(status_code=400, detail="Recurring bookings require count or until date")
        count = recurrence_count or MAX_RECURRENCE_OCCURRENCES
        if count < 1 or count > MAX_RECURRENCE_OCCURRENCES:
            raise HTTPException(status_code=400, detail=f"Recurring bookings can include 1-{MAX_RECURRENCE_OCCURRENCES} occurrences")

    occurrences: list[InventoryOccurrence] = []
    current_start = start_local
    for sequence in range(count):
        current_end = current_start + duration
        if recurrence_until_date and current_start.date() > recurrence_until_date:
            break
        occurrence_start = current_start.astimezone(timezone.utc)
        occurrence_end = current_end.astimezone(timezone.utc)
        occurrences.append(
            InventoryOccurrence(
                sequence=sequence + 1,
                start_datetime=occurrence_start,
                end_datetime=occurrence_end,
                inventory_start_datetime=occurrence_start - timedelta(minutes=space.buffer_before_minutes or 0),
                inventory_end_datetime=occurrence_end + timedelta(minutes=space.buffer_after_minutes or 0),
            )
        )
        if frequency == "weekly":
            current_start = current_start + timedelta(weeks=interval)
        elif frequency == "monthly":
            current_start = _add_months_clamped(current_start, interval)
        else:
            break

    if not occurrences:
        raise HTTPException(status_code=400, detail="Recurring booking produced no occurrences")
    if len(occurrences) > MAX_RECURRENCE_OCCURRENCES:
        raise HTTPException(status_code=400, detail=f"Recurring bookings can include at most {MAX_RECURRENCE_OCCURRENCES} occurrences")
    return occurrences


def validate_occurrences_available(
    db: Session,
    *,
    space: Space,
    location: Location,
    occurrences: list[InventoryOccurrence],
    ignore_booking_ids: set[int] | None = None,
    ignore_booking_request_id: int | None = None,
    booking_mode: str | None = None,
    full_day: bool = False,
    seats_requested: int = 1,
) -> None:
    if space.availability_status != AvailabilityStatus.AVAILABLE:
        raise HTTPException(status_code=409, detail="Space is not available")

    tz = resolve_tz(location.timezone)
    granularity = _granularity_minutes(location)
    ignore_booking_ids = ignore_booking_ids or set()

    for occurrence in occurrences:
        start_local = occurrence.start_datetime.astimezone(tz)
        end_local = occurrence.end_datetime.astimezone(tz)
        window = _open_window(start_local.date(), space, tz)
        if not window:
            raise HTTPException(status_code=409, detail="Space is closed for that date")
        open_start, open_end = window
        if start_local < open_start or end_local > open_end:
            raise HTTPException(status_code=409, detail="Requested time is outside published availability")
        if _minutes_between(start_local, end_local) < granularity:
            raise HTTPException(status_code=400, detail="Booking duration is shorter than the location granularity")
        if _minutes_between(open_start, start_local) % granularity != 0:
            raise HTTPException(status_code=400, detail="Start time must align to booking granularity")
        if _minutes_between(start_local, end_local) % granularity != 0:
            raise HTTPException(status_code=400, detail="End time must align to booking granularity")

        sub_exists = (
            db.query(Subscription)
            .filter(
                Subscription.space_id == space.id,
                Subscription.status.in_(["active", "past_due"]),
                Subscription.start_date <= end_local.date(),
                or_(Subscription.end_date.is_(None), Subscription.end_date >= start_local.date()),
                or_(
                    Subscription.booking_mode.is_(None),
                    Subscription.booking_mode.in_({"private_office_lease", "suite_lease"}),
                ),
            )
            .first()
            is not None
        )
        if sub_exists:
            raise HTTPException(status_code=409, detail="Space already subscribed for that date")

        is_shared_day_pass = (
            space.space_type == SpaceType.SHARED_DESK
            and (full_day or booking_mode == "day_pass")
        )
        if is_shared_day_pass:
            requested_seats = max(1, seats_requested or 1)
            capacity = max(1, space.capacity or 1)
            booking_seats_query = (
                db.query(func.coalesce(BookingRequest.seats_requested, 1))
                .select_from(Booking)
                .outerjoin(BookingRequest, BookingRequest.id == Booking.booking_request_id)
                .filter(
                    Booking.space_id == space.id,
                    Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
                    func.coalesce(Booking.inventory_start_datetime, Booking.start_datetime) < occurrence.inventory_end_datetime,
                    func.coalesce(Booking.inventory_end_datetime, Booking.end_datetime) > occurrence.inventory_start_datetime,
                )
            )
            if ignore_booking_ids:
                booking_seats_query = booking_seats_query.filter(~Booking.id.in_(ignore_booking_ids))
            booked_seats = sum(max(1, int(row[0] or 1)) for row in booking_seats_query.all())
            request_seats_query = db.query(BookingRequest.seats_requested).filter(
                BookingRequest.space_id == space.id,
                BookingRequest.status == BookingRequestStatus.REQUESTED,
                BookingRequest.request_kind == "daily_booking",
                BookingRequest.start_datetime < occurrence.end_datetime,
                BookingRequest.end_datetime > occurrence.start_datetime,
            )
            if ignore_booking_request_id:
                request_seats_query = request_seats_query.filter(BookingRequest.id != ignore_booking_request_id)
            requested_pending_seats = sum(max(1, int(row[0] or 1)) for row in request_seats_query.all())
            if booked_seats + requested_pending_seats + requested_seats > capacity:
                raise HTTPException(status_code=409, detail="Not enough shared desk seats are available for that date")
            continue

        booking_query = db.query(Booking).filter(
            Booking.space_id == space.id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
            func.coalesce(Booking.inventory_start_datetime, Booking.start_datetime) < occurrence.inventory_end_datetime,
            func.coalesce(Booking.inventory_end_datetime, Booking.end_datetime) > occurrence.inventory_start_datetime,
        )
        if ignore_booking_ids:
            booking_query = booking_query.filter(~Booking.id.in_(ignore_booking_ids))
        if booking_query.first() is not None:
            raise HTTPException(status_code=409, detail="Booking overlaps existing booking")

        request_exists = (
            db.query(BookingRequest)
            .filter(
                BookingRequest.space_id == space.id,
                BookingRequest.status == BookingRequestStatus.REQUESTED,
                BookingRequest.id != ignore_booking_request_id if ignore_booking_request_id else True,
                BookingRequest.start_datetime < occurrence.end_datetime,
                BookingRequest.end_datetime > occurrence.start_datetime,
            )
            .first()
            is not None
        )
        if request_exists:
            raise HTTPException(status_code=409, detail="Booking request already exists for that time")


def create_pending_booking_hold(
    db: Session,
    *,
    user_id: int,
    space: Space,
    occurrence: InventoryOccurrence,
    booking_request_id: int | None = None,
    booking_series_id: int | None = None,
) -> Booking:
    booking = Booking(
        user_id=user_id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=occurrence.start_datetime,
        end_datetime=occurrence.end_datetime,
        inventory_start_datetime=occurrence.inventory_start_datetime,
        inventory_end_datetime=occurrence.inventory_end_datetime,
        booking_request_id=booking_request_id,
        booking_series_id=booking_series_id,
        recurrence_sequence=occurrence.sequence,
        status=BookingStatus.PENDING,
    )
    db.add(booking)
    db.flush()
    return booking
