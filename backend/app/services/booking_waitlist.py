from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking_request import BookingRequest
from app.models.booking_waitlist import BookingWaitlistEntry
from app.models.enums import BookingWaitlistStatus


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def validate_waitlist_invite_for_request(
    db: Session,
    *,
    public_id: str | None,
    user_id: int,
    space_id: int,
    start_datetime: datetime | None = None,
    end_datetime: datetime | None = None,
    membership_plan_id: int | None = None,
    desired_start_date: date | None = None,
) -> BookingWaitlistEntry | None:
    if not public_id:
        return None
    entry = (
        db.query(BookingWaitlistEntry)
        .filter(BookingWaitlistEntry.public_id == public_id)
        .with_for_update()
        .first()
    )
    if not entry or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="Waitlist invite not found")
    if entry.status != BookingWaitlistStatus.INVITED.value:
        raise HTTPException(status_code=400, detail="Waitlist entry is not ready to book")
    now = datetime.now(timezone.utc)
    if entry.invite_expires_at and _as_utc(entry.invite_expires_at) <= now:
        entry.status = BookingWaitlistStatus.EXPIRED.value
        db.add(entry)
        raise HTTPException(status_code=400, detail="Waitlist invite has expired")
    if entry.space_id != space_id:
        raise HTTPException(status_code=400, detail="Waitlist invite does not match this space")

    if membership_plan_id is not None:
        if entry.membership_plan_id != membership_plan_id:
            raise HTTPException(status_code=400, detail="Waitlist invite does not match this plan")
        if desired_start_date is not None and entry.desired_start_date != desired_start_date:
            raise HTTPException(status_code=400, detail="Waitlist invite does not match this move-in date")
        return entry

    expected_start = _as_utc(entry.start_datetime)
    expected_end = _as_utc(entry.end_datetime)
    actual_start = _as_utc(start_datetime)
    actual_end = _as_utc(end_datetime)
    if expected_start != actual_start or expected_end != actual_end:
        raise HTTPException(status_code=400, detail="Waitlist invite does not match this booking time")
    return entry


def mark_waitlist_booked(
    db: Session,
    *,
    entry: BookingWaitlistEntry | None,
    booking_request: BookingRequest,
) -> None:
    if entry is None:
        return
    entry.status = BookingWaitlistStatus.BOOKED.value
    entry.booking_request_id = booking_request.id
    entry.booked_at = datetime.now(timezone.utc)
    db.add(entry)
