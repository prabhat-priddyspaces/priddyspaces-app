import logging
from typing import TYPE_CHECKING, Optional

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.email_subscription_group import EmailSubscriptionGroup
from app.models.user import User

if TYPE_CHECKING:
    from app.models.booking_request import BookingRequest
    from app.models.space import Space
    from app.models.location import Location

logger = logging.getLogger("notifications")


def _is_suppressed(db: Session, to_email: str, asm_group_id: Optional[int]) -> bool:
    user = db.query(User).filter(User.email == to_email).first()
    if user and user.email_unsubscribed_at is not None:
        return True
    if asm_group_id is not None:
        group_pref = (
            db.query(EmailSubscriptionGroup)
            .filter(
                EmailSubscriptionGroup.email == to_email,
                EmailSubscriptionGroup.asm_group_id == asm_group_id,
            )
            .first()
        )
        if group_pref and group_pref.status == "unsubscribed":
            return True
    return False


def send_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    db: Optional[Session] = None,
    asm_group_id: Optional[int] = None,
) -> None:
    if not settings.SENDGRID_API_KEY or not settings.SENDGRID_FROM_EMAIL:
        logger.info("send_email skipped (not configured) to=%s subject=%s", to_email, subject)
        return

    if db is not None and _is_suppressed(db, to_email, asm_group_id):
        logger.info(
            "send_email skipped (unsubscribed) to=%s subject=%s asm_group=%s",
            to_email, subject, asm_group_id,
        )
        return

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": settings.SENDGRID_FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    if asm_group_id is not None:
        payload["asm"] = {"group_id": asm_group_id}

    try:
        resp = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
            json=payload,
            timeout=10.0
        )
        if resp.status_code >= 400:
            logger.warning("send_email failed status=%s body=%s", resp.status_code, resp.text)
    except Exception as exc:
        logger.exception("send_email exception: %s", exc)


def send_owner_booking_request_notification(
    db: Session,
    owner_email: str,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
) -> None:
    if req.is_guest_checkout:
        requester = f"{req.guest_full_name} ({req.guest_email})"
        contact_lines = []
        if req.guest_phone:
            contact_lines.append(f"Phone: {req.guest_phone}")
        if req.guest_company_name:
            contact_lines.append(f"Company: {req.guest_company_name}")
        if req.guest_notes:
            contact_lines.append(f"Notes: {req.guest_notes}")
        contact_block = "\n".join(contact_lines)
        body = (
            f"New booking request from guest {requester}\n\n"
            f"Space: {space.name}\n"
            f"Location: {location.name}\n"
            f"From: {req.start_datetime}\n"
            f"To: {req.end_datetime}\n"
        )
        if contact_block:
            body += f"\nGuest contact:\n{contact_block}\n"
        body += f"\nReview this request in your dashboard: /owner/requests"
    else:
        body = (
            f"New booking request received.\n\n"
            f"Space: {space.name}\n"
            f"Location: {location.name}\n"
            f"From: {req.start_datetime}\n"
            f"To: {req.end_datetime}\n\n"
            f"Review this request in your dashboard: /owner/requests"
        )
    send_email(owner_email, "New booking request", body)


def send_guest_booking_confirmation(
    guest_email: str,
    guest_name: str,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
) -> None:
    body = (
        f"Hi {guest_name},\n\n"
        f"Your booking request has been submitted successfully.\n\n"
        f"Reference: {req.public_id}\n"
        f"Space: {space.name}\n"
        f"Location: {location.name}\n"
        f"From: {req.start_datetime}\n"
        f"To: {req.end_datetime}\n\n"
        f"The space owner will review your request and get back to you at this email address.\n\n"
        f"Thank you for choosing Priddyspaces!"
    )
    send_email(guest_email, "Booking request submitted", body)


def send_guest_approval_email(
    guest_email: str,
    guest_name: str,
    req: "BookingRequest",
    space: "Space",
) -> None:
    body = (
        f"Hi {guest_name},\n\n"
        f"Great news! Your booking request has been approved.\n\n"
        f"Reference: {req.public_id}\n"
        f"Space: {space.name}\n"
        f"From: {req.start_datetime}\n"
        f"To: {req.end_datetime}\n\n"
        f"Create a free account to manage your booking, view invoices, and more:\n"
        f"/sign-up\n\n"
        f"Thank you for choosing Priddyspaces!"
    )
    send_email(guest_email, "Your booking request was approved!", body)


def send_guest_rejection_email(
    guest_email: str,
    guest_name: str,
    req: "BookingRequest",
    space: "Space",
) -> None:
    body = (
        f"Hi {guest_name},\n\n"
        f"Unfortunately your booking request for {space.name} was not approved at this time.\n\n"
        f"Reference: {req.public_id}\n\n"
        f"You're welcome to browse other available spaces at Priddyspaces.\n\n"
        f"Thank you for your interest!"
    )
    send_email(guest_email, "Booking request update", body)
