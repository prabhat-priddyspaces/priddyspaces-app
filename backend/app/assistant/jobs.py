from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.assistant.runtime import _citation, public_space_url
from app.models.assistant import AssistantMessage, SpaceAlert
from app.models.booking import Booking
from app.models.enums import BookingStatus, SpaceVisibility
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.services.notifications import send_email


REMINDER_WINDOWS = [
    ("24h", timedelta(hours=24)),
    ("2h", timedelta(hours=2)),
    ("30m", timedelta(minutes=30)),
]


def build_booking_reminders(db: Session, *, now: datetime | None = None) -> list[dict[str, Any]]:
    """Return reminder payloads for a scheduler that runs every five minutes.

    The deployment currently has no standalone worker entrypoint, so this helper
    is intentionally side-effect-light and testable. A future ECS scheduled task
    can call this and send the returned reminders.
    """
    now = now or datetime.now(timezone.utc)
    reminders: list[dict[str, Any]] = []
    for label, delta in REMINDER_WINDOWS:
        window_start = now + delta
        window_end = window_start + timedelta(minutes=5)
        bookings = (
            db.query(Booking)
            .filter(
                Booking.status == BookingStatus.CONFIRMED,
                Booking.start_datetime >= window_start,
                Booking.start_datetime < window_end,
            )
            .all()
        )
        for booking in bookings:
            reminders.append(
                {
                    "kind": "booking_reminder",
                    "window": label,
                    "booking_public_id": booking.public_id,
                    "user_id": booking.user_id,
                    "send_at": now.isoformat(),
                }
            )
    return reminders


def match_space_alerts(db: Session, *, now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    matches: list[dict[str, Any]] = []
    alerts = db.query(SpaceAlert).filter(SpaceAlert.is_active.is_(True), SpaceAlert.status == "active").all()
    for alert in alerts:
        filters = alert.search_filters or {}
        query = (
            db.query(Space, Location)
            .join(Location, Location.id == Space.location_id)
            .join(Organization, Organization.id == Location.organization_id)
            .filter(Space.visibility == SpaceVisibility.PUBLIC)
        )
        if filters.get("city"):
            query = query.filter(Location.city.ilike(f"%{filters['city']}%"))
        if filters.get("space_type"):
            query = query.filter(Space.space_type == filters["space_type"])
        if filters.get("min_capacity"):
            query = query.filter(Space.capacity >= int(filters["min_capacity"]))
        row = query.first()
        if not row:
            continue
        space, location = row
        alert.matched_at = now
        alert.last_notified_at = now
        alert.notification_count += 1
        db.add(alert)
        matches.append(
            {
                "alert_public_id": alert.public_id,
                "space_public_id": space.public_id,
                "location_public_id": location.public_id,
                "citations": [_citation("space", space.public_id, public_space_url(space.public_id), space.name or "Space")],
            }
        )
    db.commit()
    return matches


def send_booking_reminder_email(to_email: str, reminder: dict[str, Any]) -> None:
    send_email(
        to_email,
        "Upcoming PriddySpaces booking",
        f"Your booking {reminder['booking_public_id']} starts in {reminder['window']}. Open the assistant for details.",
    )
