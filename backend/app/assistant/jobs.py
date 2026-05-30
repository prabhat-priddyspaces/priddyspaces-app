from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.assistant.runtime import _citation, public_space_url
from app.models.assistant import SpaceAlert
from app.models.booking import Booking
from app.models.enums import BookingStatus, SpaceVisibility
from app.models.location import Location
from app.models.marketing import OutboundMessage
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.organization import Organization
from app.models.space import Space
from app.models.user import User
from app.services.booking_email_delivery import BOOKING_EMAIL_CARD_EXPIRING, BOOKING_EMAIL_REMINDER
from app.services.notifications import send_booking_transactional_email, send_card_expiring_email, send_email


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
                    "tenant_id": booking.tenant_id,
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
        alert.status = "matched"
        alert.is_active = False
        db.add(alert)
        matches.append(
            {
                "alert_public_id": alert.public_id,
                "user_id": alert.user_id,
                "guest_id": alert.guest_id,
                "tenant_id": alert.tenant_id,
                "space_public_id": space.public_id,
                "location_public_id": location.public_id,
                "citations": [_citation("space", space.public_id, public_space_url(space.public_id), space.name or "Space")],
            }
        )
    db.commit()
    return matches


def _card_expiry_date(exp_year: int, exp_month: int) -> date | None:
    if exp_year < 2000 or exp_month < 1 or exp_month > 12:
        return None
    return date(exp_year, exp_month, calendar.monthrange(exp_year, exp_month)[1])


def _card_expiry_notice_exists(db: Session, method: MemberOwnerPaymentMethod, expiry: str) -> bool:
    rows = (
        db.query(OutboundMessage)
        .filter(
            OutboundMessage.source == "transactional",
            OutboundMessage.user_id == method.user_id,
            OutboundMessage.tenant_id == method.organization_id,
        )
        .all()
    )
    for row in rows:
        context = row.source_context or {}
        if (
            context.get("notification_type") == BOOKING_EMAIL_CARD_EXPIRING
            and context.get("member_owner_payment_method_public_id") == method.public_id
            and context.get("card_expiry") == expiry
        ):
            return True
    return False


def send_card_expiry_notices(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 100,
) -> dict[str, int]:
    today = (now or datetime.now(timezone.utc)).date()
    window_end = today + timedelta(days=30)
    sent = 0
    skipped = 0
    methods = (
        db.query(MemberOwnerPaymentMethod)
        .filter(
            MemberOwnerPaymentMethod.status.in_(["active", "expiring", "expired"]),
            MemberOwnerPaymentMethod.exp_month.isnot(None),
            MemberOwnerPaymentMethod.exp_year.isnot(None),
        )
        .order_by(MemberOwnerPaymentMethod.updated_at.asc())
        .limit(limit)
        .all()
    )
    for method in methods:
        expiry_date = _card_expiry_date(method.exp_year or 0, method.exp_month or 0)
        if not expiry_date or expiry_date > window_end:
            skipped += 1
            continue
        expiry = f"{method.exp_month:02d}/{method.exp_year}"
        if _card_expiry_notice_exists(db, method, expiry):
            skipped += 1
            continue
        user = db.query(User).filter(User.id == method.user_id).first()
        org = db.query(Organization).filter(Organization.id == method.organization_id).first()
        if not user or not user.email or not org:
            skipped += 1
            continue
        send_card_expiring_email(db, user=user, organization=org, method=method, expired=expiry_date < today)
        sent += 1
    return {"card_expiry_notices_sent": sent, "card_expiry_notices_skipped": skipped}


def send_booking_reminder_email(to_email: str, reminder: dict[str, Any], *, db: Session | None = None) -> None:
    if db is not None:
        booking = db.query(Booking).filter(Booking.public_id == reminder["booking_public_id"]).first()
        if booking:
            space = db.query(Space).filter(Space.id == booking.space_id).first()
            location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
            if space and location:
                send_booking_transactional_email(
                    db=db,
                    to_email=to_email,
                    subject="Upcoming PriddySpaces booking",
                    body=f"Your booking {reminder['booking_public_id']} starts in {reminder['window']}.",
                    html_body=None,
                    booking=booking,
                    space=space,
                    location=location,
                    notification_type=BOOKING_EMAIL_REMINDER,
                    recipient_role="member",
                    recipient_user_id=booking.user_id,
                    source="transactional",
                )
                return
    send_email(
        to_email,
        "Upcoming PriddySpaces booking",
        f"Your booking {reminder['booking_public_id']} starts in {reminder['window']}. Open the assistant for details.",
        db=db,
    )


def send_space_alert_email(to_email: str, match: dict[str, Any], *, db: Session | None = None) -> None:
    send_email(
        to_email,
        "A PriddySpaces match is available",
        f"We found a space matching your alert: {match['space_public_id']}. Open PriddySpaces for details.",
        db=db,
    )
