"""Booking-request notification orchestration.

Extracted from app/api/booking_requests.py (B3): the fan-out that emails the
member and the owner team on submit / confirm / payment-failure / cancellation.
Each orchestrator swallows-and-logs send failures so a notification problem never
breaks the request flow. Imports only services / models (never the api package).
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import UserRole
from app.models.location import Location
from app.models.organization_member import OrganizationMember
from app.models.payment import Payment
from app.models.space import Space
from app.models.user import User
from app.services.authz import user_can_access_location
from app.services.notifications import (
    send_booking_cancelled_email,
    send_booking_payment_failed_email,
    send_booking_request_cancelled_email,
    send_booking_request_submitted_email,
    send_owner_booking_cancelled_notification,
    send_owner_booking_payment_failed_notification,
    send_owner_booking_request_notification,
    send_owner_confirmed_booking_notification,
)
from app.services.payment_metadata import normalize_payment_failure_reason

logger = logging.getLogger(__name__)


def owner_notification_recipients_for_space(db: Session, space: Space) -> list[tuple[str, str, int]]:
    """Return opted-in owner-side users who can access this space's location."""
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        return []
    roles = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}
    members = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == location.organization_id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.receives_new_booking_email.is_(True),
            OrganizationMember.role.in_(roles),
        )
        .all()
    )
    accessible_members = [
        member
        for member in members
        if user_can_access_location(db, member.user_id, location, roles)
    ]
    user_ids = {member.user_id for member in accessible_members}
    if not user_ids:
        return []
    users = {user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()}
    recipients = []
    seen_emails: set[str] = set()
    for member in accessible_members:
        user = users.get(member.user_id)
        if not user or not user.email or user.email in seen_emails:
            continue
        seen_emails.add(user.email)
        recipients.append((user.email, member.role.value, user.id))
    return sorted(recipients, key=lambda item: item[0])


def notify_owner_team_of_request(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    for owner_email, role, user_id in owner_notification_recipients_for_space(db, space):
        send_owner_booking_request_notification(
            db,
            owner_email,
            req,
            space,
            location,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def send_booking_request_notifications(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
) -> None:
    try:
        send_booking_request_submitted_email(db, req, space, location, actor_user_id=actor_user_id)
    except Exception:
        logger.exception(
            "Failed to send booking request submitted email request_public_id=%s",
            req.public_id,
        )
    try:
        notify_owner_team_of_request(db, req, space, location, actor_user_id=actor_user_id)
    except Exception:
        logger.exception(
            "Failed to notify owner team for booking request request_public_id=%s",
            req.public_id,
        )


def notify_owner_team_of_confirmed_booking(
    db: Session,
    req: BookingRequest,
    booking: Booking | None,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    if not booking:
        return
    for owner_email, role, user_id in owner_notification_recipients_for_space(db, space):
        send_owner_confirmed_booking_notification(
            db,
            owner_email,
            req,
            booking,
            space,
            location,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def notify_owner_team_of_payment_failed(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    reason = None
    last_payment = (
        db.query(Payment)
        .filter(Payment.booking_request_id == req.id)
        .order_by(Payment.created_at.desc())
        .first()
    )
    if last_payment and last_payment.failure_reason:
        reason = normalize_payment_failure_reason(last_payment.failure_reason)
    for owner_email, role, user_id in owner_notification_recipients_for_space(db, space):
        send_owner_booking_payment_failed_notification(
            db,
            owner_email,
            req,
            space,
            location,
            failure_reason=reason,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def send_payment_failed_notifications(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    try:
        send_booking_payment_failed_email(db, req, space, location, actor_user_id=actor_user_id, resend=resend)
    except Exception:
        logger.exception(
            "Failed to send booking payment failed email request_public_id=%s",
            req.public_id,
        )
    try:
        notify_owner_team_of_payment_failed(db, req, space, location, actor_user_id=actor_user_id, resend=resend)
    except Exception:
        logger.exception(
            "Failed to notify owner team of payment failure request_public_id=%s",
            req.public_id,
        )


def notify_owner_team_of_cancelled_booking(
    db: Session,
    req: BookingRequest,
    booking: Booking | None,
    space: Space,
    location: Location,
    *,
    reason: str | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    for owner_email, role, user_id in owner_notification_recipients_for_space(db, space):
        send_owner_booking_cancelled_notification(
            db,
            owner_email,
            req,
            space,
            location,
            booking=booking,
            reason=reason,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def send_cancelled_notifications(
    db: Session,
    req: BookingRequest,
    booking: Booking | None,
    space: Space,
    location: Location,
    *,
    reason: str | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    try:
        if booking:
            send_booking_cancelled_email(db, booking, req, space, location, actor_user_id=actor_user_id, resend=resend)
        else:
            send_booking_request_cancelled_email(db, req, space, location, actor_user_id=actor_user_id, resend=resend)
    except Exception:
        logger.exception(
            "Failed to send booking cancellation email request_public_id=%s",
            req.public_id,
        )
    try:
        notify_owner_team_of_cancelled_booking(
            db,
            req,
            booking,
            space,
            location,
            reason=reason,
            actor_user_id=actor_user_id,
            resend=resend,
        )
    except Exception:
        logger.exception(
            "Failed to notify owner team of cancellation request_public_id=%s",
            req.public_id,
        )
