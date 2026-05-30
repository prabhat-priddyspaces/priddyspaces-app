from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, BookingStatus, SpaceType
from app.models.subscription import Subscription

_BLOCKING_SUBSCRIPTION_STATUSES = {"pending_payment", "active", "past_due"}
_EXCLUSIVE_BOOKING_MODES = {"private_office_lease", "suite_lease"}


def _resolve_tz(name: str | None) -> ZoneInfo:
    if not name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def get_space_availability(
    db: Session,
    *,
    space_id: int,
    location_timezone: str | None,
    start_date: date,
    end_date: date,
    availability_start_time: time | None = None,
    availability_end_time: time | None = None,
    space_type: str | None = None,
    space_capacity: int | None = None,
) -> list[dict]:
    """Per-day busy intervals (HH:MM, location-local) and full-day blocks for a space."""
    if end_date < start_date:
        return []

    tz = _resolve_tz(location_timezone)
    range_start = datetime.combine(start_date, time.min, tzinfo=tz).astimezone(timezone.utc)
    range_end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)

    shared_desk_capacity = (
        max(1, space_capacity or 1)
        if space_type == SpaceType.SHARED_DESK.value
        else None
    )

    booking_query = db.query(
        func.coalesce(Booking.inventory_start_datetime, Booking.start_datetime),
        func.coalesce(Booking.inventory_end_datetime, Booking.end_datetime),
        func.coalesce(BookingRequest.seats_requested, 1),
    ).outerjoin(BookingRequest, BookingRequest.id == Booking.booking_request_id)
    bookings = (
        booking_query
        .filter(
            Booking.space_id == space_id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
            func.coalesce(Booking.inventory_start_datetime, Booking.start_datetime) < range_end,
            func.coalesce(Booking.inventory_end_datetime, Booking.end_datetime) > range_start,
        )
        .all()
    )

    requests = (
        db.query(
            BookingRequest.start_datetime,
            BookingRequest.end_datetime,
            BookingRequest.seats_requested,
        )
        .filter(
            BookingRequest.space_id == space_id,
            BookingRequest.status == BookingRequestStatus.REQUESTED,
            BookingRequest.start_datetime < range_end,
            BookingRequest.end_datetime > range_start,
        )
        .all()
    )

    subscriptions = (
        db.query(Subscription.start_date, Subscription.end_date)
        .filter(
            Subscription.space_id == space_id,
            Subscription.status.in_(_BLOCKING_SUBSCRIPTION_STATUSES),
            Subscription.start_date <= end_date,
            or_(Subscription.end_date.is_(None), Subscription.end_date >= start_date),
            or_(
                Subscription.booking_mode.is_(None),
                Subscription.booking_mode.in_(_EXCLUSIVE_BOOKING_MODES),
            ),
        )
        .all()
    )

    blocked_days: set[date] = set()
    for sub_start, sub_end in subscriptions:
        block_end = sub_end or end_date
        cur = max(start_date, sub_start)
        last = min(end_date, block_end)
        while cur <= last:
            blocked_days.add(cur)
            cur += timedelta(days=1)

    busy_by_day: dict[date, list[tuple[str, str]]] = defaultdict(list)
    sold_seats_by_day: dict[date, int] = defaultdict(int)
    for start_dt, end_dt, seats_requested in list(bookings) + list(requests):
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        start_local = start_dt.astimezone(tz)
        end_local = end_dt.astimezone(tz)
        cur_day = start_local.date()
        while cur_day <= end_local.date():
            day_start = datetime.combine(cur_day, time.min, tzinfo=tz)
            day_end = day_start + timedelta(days=1)
            interval_start = max(start_local, day_start)
            interval_end = min(end_local, day_end)
            if interval_start < interval_end and start_date <= cur_day <= end_date:
                if shared_desk_capacity is not None:
                    sold_seats_by_day[cur_day] += max(1, seats_requested or 1)
                else:
                    end_label = (
                        "24:00"
                        if interval_end == day_end
                        else interval_end.strftime("%H:%M")
                    )
                    busy_by_day[cur_day].append(
                        (interval_start.strftime("%H:%M"), end_label)
                    )
            cur_day += timedelta(days=1)

    open_start = availability_start_time or time(9, 0)
    open_end = availability_end_time or time(18, 0)

    def _minutes(value: str) -> int:
        if value == "24:00":
            return 24 * 60
        hour, minute = value.split(":", 1)
        return int(hour) * 60 + int(minute)

    def _covers_open_window(intervals: list[tuple[str, str]]) -> bool:
        open_start_minutes = open_start.hour * 60 + open_start.minute
        open_end_minutes = open_end.hour * 60 + open_end.minute
        if open_end_minutes <= open_start_minutes:
            return False
        clipped = sorted(
            (
                max(open_start_minutes, _minutes(start_label)),
                min(open_end_minutes, _minutes(end_label)),
            )
            for start_label, end_label in intervals
        )
        cursor = open_start_minutes
        for start_minutes, end_minutes in clipped:
            if end_minutes <= start_minutes:
                continue
            if start_minutes > cursor:
                return False
            cursor = max(cursor, end_minutes)
            if cursor >= open_end_minutes:
                return True
        return False

    days: list[dict] = []
    cur = start_date
    while cur <= end_date:
        intervals = sorted(busy_by_day.get(cur, []))
        if shared_desk_capacity is not None:
            sold_out = sold_seats_by_day.get(cur, 0) >= shared_desk_capacity
            fully_blocked = cur in blocked_days or sold_out
            intervals = [(open_start.strftime("%H:%M"), open_end.strftime("%H:%M"))] if fully_blocked else []
        else:
            fully_blocked = cur in blocked_days or _covers_open_window(intervals)
        days.append(
            {
                "date": cur.isoformat(),
                "fully_blocked": fully_blocked,
                "busy_intervals": [
                    {"start": s, "end": e} for s, e in intervals
                ],
            }
        )
        cur += timedelta(days=1)

    return days
