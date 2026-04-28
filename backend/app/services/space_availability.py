from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, BookingStatus
from app.models.subscription import Subscription


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
) -> list[dict]:
    """Per-day busy intervals (HH:MM, location-local) and full-day blocks for a space."""
    if end_date < start_date:
        return []

    tz = _resolve_tz(location_timezone)
    range_start = datetime.combine(start_date, time.min, tzinfo=tz).astimezone(timezone.utc)
    range_end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)

    bookings = (
        db.query(Booking.start_datetime, Booking.end_datetime)
        .filter(
            Booking.space_id == space_id,
            Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
            Booking.start_datetime < range_end,
            Booking.end_datetime > range_start,
        )
        .all()
    )

    requests = (
        db.query(BookingRequest.start_datetime, BookingRequest.end_datetime)
        .filter(
            BookingRequest.space_id == space_id,
            BookingRequest.status.in_([BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED]),
            BookingRequest.start_datetime < range_end,
            BookingRequest.end_datetime > range_start,
        )
        .all()
    )

    subscriptions = (
        db.query(Subscription.start_date, Subscription.end_date)
        .filter(
            Subscription.space_id == space_id,
            Subscription.status.in_(["active", "past_due"]),
            Subscription.start_date <= end_date,
            or_(Subscription.end_date.is_(None), Subscription.end_date >= start_date),
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
    for start_dt, end_dt in list(bookings) + list(requests):
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
                end_label = (
                    "24:00"
                    if interval_end == day_end
                    else interval_end.strftime("%H:%M")
                )
                busy_by_day[cur_day].append(
                    (interval_start.strftime("%H:%M"), end_label)
                )
            cur_day += timedelta(days=1)

    days: list[dict] = []
    cur = start_date
    while cur <= end_date:
        intervals = sorted(busy_by_day.get(cur, []))
        days.append(
            {
                "date": cur.isoformat(),
                "fully_blocked": cur in blocked_days,
                "busy_intervals": [
                    {"start": s, "end": e} for s, e in intervals
                ],
            }
        )
        cur += timedelta(days=1)

    return days
