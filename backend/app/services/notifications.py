import base64
import logging
from datetime import datetime, timezone
from html import escape
from typing import TYPE_CHECKING, Optional, TypedDict

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.email_subscription_group import EmailSubscriptionGroup
from app.models.user import User

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.booking_request import BookingRequest
    from app.models.location import Location
    from app.models.space import Space

logger = logging.getLogger("notifications")


class EmailAttachment(TypedDict, total=False):
    content: str
    type: str
    filename: str
    disposition: str


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
    html_body: str | None = None,
    attachments: list[EmailAttachment] | None = None,
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

    content = [{"type": "text/plain", "value": body}]
    if html_body:
        content.append({"type": "text/html", "value": html_body})

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": settings.SENDGRID_FROM_EMAIL},
        "subject": subject,
        "content": content,
    }
    if attachments:
        payload["attachments"] = attachments
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


def _frontend_url(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _format_dt(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _ics_escape(value: object | None) -> str:
    text = "" if value is None else str(value)
    return (
        text.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(",", "\\,")
        .replace(";", "\\;")
    )


def _ics_attachment(
    *,
    booking: "Booking",
    req: "BookingRequest | None",
    space: "Space",
    location: "Location",
    attendee_email: str,
    attendee_name: str,
    method: str,
) -> EmailAttachment:
    uid = f"booking-{booking.public_id}@priddyspaces.com"
    status = "CANCELLED" if method == "CANCEL" else "CONFIRMED"
    summary = "Canceled: " if method == "CANCEL" else ""
    summary += f"{space.name or 'Workspace'} booking"
    description_parts = [
        f"Booking reference: {booking.public_id}",
        f"Request reference: {req.public_id}" if req else "",
        f"Space: {space.name or space.public_id}",
        f"Location: {location.name}",
    ]
    description = "\\n".join(_ics_escape(part) for part in description_parts if part)
    ics = "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Priddyspaces//Booking Calendar//EN",
            f"METHOD:{method}",
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{_format_dt(datetime.now(timezone.utc))}",
            f"DTSTART:{_format_dt(booking.start_datetime)}",
            f"DTEND:{_format_dt(booking.end_datetime)}",
            f"SUMMARY:{_ics_escape(summary)}",
            f"LOCATION:{_ics_escape(location.address or location.name)}",
            f"DESCRIPTION:{description}",
            f"STATUS:{status}",
            f"ORGANIZER;CN=Priddyspaces:mailto:{settings.SENDGRID_FROM_EMAIL}",
            (
                f"ATTENDEE;CN={_ics_escape(attendee_name)};RSVP=FALSE:"
                f"mailto:{attendee_email}"
            ),
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ]
    )
    return {
        "content": base64.b64encode(ics.encode("utf-8")).decode("ascii"),
        "type": f"text/calendar; method={method}; charset=UTF-8",
        "filename": f"{booking.public_id}.ics",
        "disposition": "attachment",
    }


def _requester_name(db: Session, req: "BookingRequest") -> str:
    if req.is_guest_checkout:
        return req.guest_full_name or "Guest"
    user = db.query(User).filter(User.id == req.user_id).first() if req.user_id else None
    if not user:
        return "Member"
    return user.full_name or user.first_name or user.email or "Member"


def _requester_email(db: Session, req: "BookingRequest") -> str | None:
    if req.is_guest_checkout:
        return req.guest_email
    user = db.query(User).filter(User.id == req.user_id).first() if req.user_id else None
    return user.email if user else None


def _html_shell(title: str, lines: list[str], buttons: list[tuple[str, str, str]] | None = None) -> str:
    escaped_lines = "".join(f"<p>{escape(line)}</p>" for line in lines if line)
    button_html = ""
    if buttons:
        parts = []
        for label, url, color in buttons:
            parts.append(
                f'<a href="{escape(url, quote=True)}" '
                f'style="display:inline-block;margin:8px 8px 0 0;padding:10px 14px;'
                f'border-radius:6px;background:{color};color:#ffffff;text-decoration:none;'
                f'font-weight:600">{escape(label)}</a>'
            )
        button_html = f"<p>{''.join(parts)}</p>"
    return (
        "<div style=\"font-family:Arial,sans-serif;line-height:1.45;color:#111827\">"
        f"<h2>{escape(title)}</h2>{escaped_lines}{button_html}</div>"
    )


def send_owner_booking_request_notification(
    db: Session,
    owner_email: str,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
) -> None:
    requester_email = _requester_email(db, req)
    requester = _requester_name(db, req)
    if requester_email:
        requester = f"{requester} ({requester_email})"
    lines = [
        f"New booking request from {requester}.",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
    ]
    if req.is_guest_checkout:
        if req.guest_phone:
            lines.append(f"Phone: {req.guest_phone}")
        if req.guest_company_name:
            lines.append(f"Company: {req.guest_company_name}")
        if req.guest_notes:
            lines.append(f"Notes: {req.guest_notes}")

    approve_url = _frontend_url(f"/owner/requests?request={req.public_id}&decision=approve")
    reject_url = _frontend_url(f"/owner/requests?request={req.public_id}&decision=reject")
    body = "\n".join(lines + ["", f"Approve: {approve_url}", f"Reject: {reject_url}"])
    html = _html_shell(
        "New booking request",
        lines,
        [
            ("Review and approve", approve_url, "#0f766e"),
            ("Review and reject", reject_url, "#991b1b"),
        ],
    )
    send_email(owner_email, "New booking request", body, db=db, html_body=html)


def send_owner_confirmed_booking_notification(
    db: Session,
    owner_email: str,
    req: "BookingRequest",
    booking: "Booking",
    space: "Space",
    location: "Location",
) -> None:
    requester_email = _requester_email(db, req)
    requester = _requester_name(db, req)
    if requester_email:
        requester = f"{requester} ({requester_email})"
    lines = [
        f"New confirmed booking from {requester}.",
        f"Booking: {booking.public_id}",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {booking.start_datetime}",
        f"To: {booking.end_datetime}",
    ]
    dashboard_url = _frontend_url("/owner/calendar")
    body = "\n".join(lines + ["", f"View calendar: {dashboard_url}"])
    html = _html_shell("New confirmed booking", lines, [("View calendar", dashboard_url, "#0f766e")])
    send_email(owner_email, "New confirmed booking", body, db=db, html_body=html)


def send_booking_request_submitted_email(
    db: Session,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
) -> None:
    to_email = _requester_email(db, req)
    if not to_email:
        return
    name = _requester_name(db, req)
    lines = [
        f"Hi {name},",
        "Your booking request has been submitted successfully.",
        f"Reference: {req.public_id}",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
        "The space owner will review your request and get back to you.",
    ]
    subject = "Booking request submitted"
    if req.request_kind in {"membership_purchase", "lease_purchase"}:
        subject = "Membership request submitted"
    send_email(to_email, subject, "\n".join(lines), db=db, html_body=_html_shell(subject, lines))


def send_booking_confirmed_email(
    db: Session,
    req: "BookingRequest",
    booking: "Booking | None",
    space: "Space",
    location: "Location",
) -> None:
    to_email = _requester_email(db, req)
    if not to_email:
        return
    name = _requester_name(db, req)
    lines = [
        f"Hi {name},",
        "Your booking is confirmed.",
        f"Reference: {req.public_id}",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
    ]
    attachments = []
    if booking:
        attachments.append(
            _ics_attachment(
                booking=booking,
                req=req,
                space=space,
                location=location,
                attendee_email=to_email,
                attendee_name=name,
                method="REQUEST",
            )
        )
    send_email(
        to_email,
        "Booking confirmed",
        "\n".join(lines),
        db=db,
        html_body=_html_shell("Booking confirmed", lines),
        attachments=attachments or None,
    )


def send_booking_rejected_email(
    db: Session,
    req: "BookingRequest",
    space: "Space",
) -> None:
    to_email = _requester_email(db, req)
    if not to_email:
        return
    name = _requester_name(db, req)
    lines = [
        f"Hi {name},",
        f"Unfortunately your booking request for {space.name} was not approved at this time.",
        f"Reference: {req.public_id}",
        "You're welcome to browse other available spaces at Priddyspaces.",
    ]
    send_email(
        to_email,
        "Booking request update",
        "\n".join(lines),
        db=db,
        html_body=_html_shell("Booking request update", lines),
    )


def send_booking_payment_failed_email(db: Session, req: "BookingRequest", space: "Space") -> None:
    to_email = _requester_email(db, req)
    if not to_email:
        return
    name = _requester_name(db, req)
    lines = [
        f"Hi {name},",
        f"We could not charge the saved payment method for your booking request at {space.name}.",
        f"Reference: {req.public_id}",
        "The owner can retry the charge after the payment method is updated.",
    ]
    send_email(
        to_email,
        "Booking payment failed",
        "\n".join(lines),
        db=db,
        html_body=_html_shell("Booking payment failed", lines),
    )


def send_booking_cancelled_email(
    db: Session,
    booking: "Booking",
    req: "BookingRequest | None",
    space: "Space",
    location: "Location",
) -> None:
    to_email = _requester_email(db, req) if req else None
    if not to_email:
        user = db.query(User).filter(User.id == booking.user_id).first()
        to_email = user.email if user else None
    if not to_email:
        return
    name = _requester_name(db, req) if req else "Member"
    lines = [
        f"Hi {name},",
        "Your booking has been canceled.",
        f"Booking: {booking.public_id}",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {booking.start_datetime}",
        f"To: {booking.end_datetime}",
    ]
    send_email(
        to_email,
        "Booking canceled",
        "\n".join(lines),
        db=db,
        html_body=_html_shell("Booking canceled", lines),
        attachments=[
            _ics_attachment(
                booking=booking,
                req=req,
                space=space,
                location=location,
                attendee_email=to_email,
                attendee_name=name,
                method="CANCEL",
            )
        ],
    )


def send_booking_request_cancelled_email(db: Session, req: "BookingRequest", space: "Space") -> None:
    to_email = _requester_email(db, req)
    if not to_email:
        return
    name = _requester_name(db, req)
    lines = [
        f"Hi {name},",
        "Your booking request has been canceled.",
        f"Reference: {req.public_id}",
        f"Space: {space.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
    ]
    send_email(
        to_email,
        "Booking request canceled",
        "\n".join(lines),
        db=db,
        html_body=_html_shell("Booking request canceled", lines),
    )


def send_guest_booking_confirmation(
    guest_email: str,
    guest_name: str,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
) -> None:
    # Backward-compatible wrapper for existing imports.
    lines = [
        f"Hi {guest_name},",
        "Your booking request has been submitted successfully.",
        f"Reference: {req.public_id}",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
        "The space owner will review your request and get back to you at this email address.",
    ]
    send_email(guest_email, "Booking request submitted", "\n".join(lines))


def send_guest_approval_email(
    guest_email: str,
    guest_name: str,
    req: "BookingRequest",
    space: "Space",
) -> None:
    lines = [
        f"Hi {guest_name},",
        "Your booking request has been approved.",
        f"Reference: {req.public_id}",
        f"Space: {space.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
    ]
    send_email(guest_email, "Your booking request was approved!", "\n".join(lines))


def send_guest_rejection_email(
    guest_email: str,
    guest_name: str,
    req: "BookingRequest",
    space: "Space",
) -> None:
    lines = [
        f"Hi {guest_name},",
        f"Unfortunately your booking request for {space.name} was not approved at this time.",
        f"Reference: {req.public_id}",
    ]
    send_email(guest_email, "Booking request update", "\n".join(lines))
