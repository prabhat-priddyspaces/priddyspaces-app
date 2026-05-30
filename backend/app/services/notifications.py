import base64
import logging
from datetime import datetime, timezone
from html import escape
from typing import TYPE_CHECKING, Any, Optional, TypedDict

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.marketing import OutboundMessage
from app.models.email_subscription_group import EmailSubscriptionGroup
from app.models.space_access_pass import SpaceAccessPass
from app.models.user import User
from app.services.access_passes import access_pass_url, decrypted_token, qr_png_base64
from app.services.booking_email_delivery import (
    BOOKING_EMAIL_CANCELLED,
    BOOKING_EMAIL_CONFIRMED,
    BOOKING_EMAIL_OWNER_CONFIRMED,
    BOOKING_EMAIL_OWNER_CANCELLED,
    BOOKING_EMAIL_OWNER_PAYMENT_FAILED,
    BOOKING_EMAIL_OWNER_REQUEST,
    BOOKING_EMAIL_PAYMENT_FAILED,
    BOOKING_EMAIL_REJECTED,
    BOOKING_EMAIL_REQUEST_CANCELLED,
    BOOKING_EMAIL_REQUEST_SUBMITTED,
    now_utc,
)

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


def _booking_source_context(
    *,
    notification_type: str,
    recipient_role: str,
    req: "BookingRequest | None" = None,
    booking: "Booking | None" = None,
    actor_user_id: int | None = None,
    resend: bool = False,
    resend_of_public_id: str | None = None,
    attachments: list[EmailAttachment] | None = None,
) -> dict[str, Any]:
    context: dict[str, Any] = {
        "notification_type": notification_type,
        "recipient_role": recipient_role,
        "booking_request_public_id": req.public_id if req else None,
        "booking_public_id": booking.public_id if booking else None,
        "actor_user_id": actor_user_id,
        "resend": resend,
    }
    if resend_of_public_id:
        context["resend_of_public_id"] = resend_of_public_id
    if resend:
        context["resent_at"] = now_utc().isoformat()
        if actor_user_id:
            context["resent_by_user_id"] = actor_user_id
    if attachments:
        context["attachments"] = [
            {"filename": attachment.get("filename"), "type": attachment.get("type")}
            for attachment in attachments
        ]
    return context


def send_booking_transactional_email(
    db: Session,
    *,
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    attachments: list[EmailAttachment] | None = None,
    req: "BookingRequest | None" = None,
    booking: "Booking | None" = None,
    space: "Space | None" = None,
    location: "Location | None" = None,
    notification_type: str,
    recipient_role: str,
    recipient_user_id: int | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
    resend_of_public_id: str | None = None,
) -> OutboundMessage:
    user_id = recipient_user_id
    if user_id is None and to_email:
        user = db.query(User).filter(User.email == to_email).first()
        user_id = user.id if user else None

    organization_id = None
    tenant_id = None
    if location:
        organization_id = location.organization_id
        tenant_id = location.tenant_id
    if space:
        tenant_id = tenant_id or space.tenant_id
        organization_id = organization_id or space.tenant_id
    if req:
        tenant_id = tenant_id or req.tenant_id
    if booking:
        tenant_id = tenant_id or booking.tenant_id
    organization_id = organization_id or tenant_id or 0
    tenant_id = tenant_id or organization_id

    context = _booking_source_context(
        notification_type=notification_type,
        recipient_role=recipient_role,
        req=req,
        booking=booking,
        actor_user_id=actor_user_id,
        resend=resend,
        resend_of_public_id=resend_of_public_id,
        attachments=attachments,
    )
    outbound = OutboundMessage(
        organization_id=organization_id,
        tenant_id=tenant_id,
        user_id=user_id,
        email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=body,
        sender_lane="transactional",
        from_email=settings.SENDGRID_FROM_EMAIL or "no-reply@priddyspaces.local",
        from_name="Priddyspaces",
        provider="sendgrid",
        status="queued",
        source="booking",
        source_context=context,
    )
    db.add(outbound)
    db.commit()
    db.refresh(outbound)

    if not settings.SENDGRID_API_KEY or not settings.SENDGRID_FROM_EMAIL:
        outbound.status = "failed"
        outbound.error = "SendGrid is not configured for transactional email"
        outbound.source_context = {
            **(outbound.source_context or {}),
            "diagnostic": "sendgrid_not_configured",
        }
        db.add(outbound)
        db.commit()
        db.refresh(outbound)
        logger.warning(
            "booking transactional email failed (not configured) to=%s subject=%s outbound=%s",
            to_email,
            subject,
            outbound.public_id,
        )
        return outbound

    content = [{"type": "text/plain", "value": body}]
    if html_body:
        content.append({"type": "text/html", "value": html_body})
    custom_args = {
        "outbound_public_id": outbound.public_id,
        "source": "booking",
        "notification_type": notification_type,
    }
    if req:
        custom_args["booking_request_public_id"] = req.public_id
    if booking:
        custom_args["booking_public_id"] = booking.public_id
    payload: dict[str, Any] = {
        "personalizations": [
            {
                "to": [{"email": to_email}],
                "custom_args": custom_args,
            }
        ],
        "from": {"email": settings.SENDGRID_FROM_EMAIL, "name": "Priddyspaces"},
        "subject": subject,
        "content": content,
    }
    if attachments:
        payload["attachments"] = attachments

    try:
        resp = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
            json=payload,
            timeout=10.0,
        )
        if resp.status_code >= 400:
            outbound.status = "failed"
            outbound.error = resp.text[:2000]
        else:
            outbound.status = "sent"
            outbound.provider_message_id = resp.headers.get("X-Message-Id") or resp.headers.get("x-message-id")
            outbound.sent_at = now_utc()
    except Exception as exc:
        logger.exception("booking transactional email exception: %s", exc)
        outbound.status = "failed"
        outbound.error = str(exc)

    db.add(outbound)
    db.commit()
    db.refresh(outbound)
    return outbound


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
    *,
    recipient_role: str = "owner",
    recipient_user_id: int | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage:
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
    return send_booking_transactional_email(
        db,
        to_email=owner_email,
        subject="New booking request",
        body=body,
        html_body=html,
        req=req,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_OWNER_REQUEST,
        recipient_role=recipient_role,
        recipient_user_id=recipient_user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_owner_confirmed_booking_notification(
    db: Session,
    owner_email: str,
    req: "BookingRequest",
    booking: "Booking",
    space: "Space",
    location: "Location",
    *,
    recipient_role: str = "owner",
    recipient_user_id: int | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage:
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
    return send_booking_transactional_email(
        db,
        to_email=owner_email,
        subject="New confirmed booking",
        body=body,
        html_body=html,
        req=req,
        booking=booking,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_OWNER_CONFIRMED,
        recipient_role=recipient_role,
        recipient_user_id=recipient_user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def _format_retry_deadline(req: "BookingRequest") -> str | None:
    deadline = getattr(req, "payment_hold_expires_at", None)
    if not deadline:
        return None
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return deadline.astimezone(timezone.utc).strftime("%b %d, %Y, %I:%M %p UTC").replace(" 0", " ")


def send_owner_booking_payment_failed_notification(
    db: Session,
    owner_email: str,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
    *,
    failure_reason: str | None = None,
    recipient_role: str = "owner",
    recipient_user_id: int | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage:
    requester_email = _requester_email(db, req)
    requester = _requester_name(db, req)
    if requester_email:
        requester = f"{requester} ({requester_email})"
    deadline = _format_retry_deadline(req)
    lines = [
        f"Payment failed for {requester}.",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
        f"Reason: {failure_reason or 'The payment processor declined the charge.'}",
    ]
    if deadline:
        lines.append(f"The booking hold is open until {deadline}.")
    else:
        lines.append("The booking hold was not kept open.")
    request_url = _frontend_url(f"/owner/requests?request={req.public_id}")
    body = "\n".join(lines + ["", f"View request: {request_url}"])
    html = _html_shell("Booking payment failed", lines, [("View request", request_url, "#991b1b")])
    return send_booking_transactional_email(
        db,
        to_email=owner_email,
        subject="Booking payment failed",
        body=body,
        html_body=html,
        req=req,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_OWNER_PAYMENT_FAILED,
        recipient_role=recipient_role,
        recipient_user_id=recipient_user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_booking_request_submitted_email(
    db: Session,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage | None:
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
    return send_booking_transactional_email(
        db,
        to_email=to_email,
        subject=subject,
        body="\n".join(lines),
        html_body=_html_shell(subject, lines),
        req=req,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_REQUEST_SUBMITTED,
        recipient_role="guest" if req.is_guest_checkout else "member",
        recipient_user_id=req.user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_booking_confirmed_email(
    db: Session,
    req: "BookingRequest",
    booking: "Booking | None",
    space: "Space",
    location: "Location",
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage | None:
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
        access_pass = db.query(SpaceAccessPass).filter(SpaceAccessPass.booking_id == booking.id).first()
        if access_pass:
            pass_token = decrypted_token(access_pass)
            pass_url = access_pass_url(pass_token)
            lines.append(f"Access pass: {pass_url}")
            qr_png = qr_png_base64(pass_token)
            if qr_png:
                attachments.append(
                    {
                        "content": qr_png,
                        "type": "image/png",
                        "filename": f"access-pass-{booking.public_id}.png",
                        "disposition": "attachment",
                    }
                )
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
    return send_booking_transactional_email(
        db=db,
        to_email=to_email,
        subject="Booking confirmed",
        body="\n".join(lines),
        html_body=_html_shell("Booking confirmed", lines),
        attachments=attachments or None,
        req=req,
        booking=booking,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_CONFIRMED,
        recipient_role="guest" if req.is_guest_checkout else "member",
        recipient_user_id=req.user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_booking_rejected_email(
    db: Session,
    req: "BookingRequest",
    space: "Space",
    location: "Location | None" = None,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage | None:
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
    return send_booking_transactional_email(
        db=db,
        to_email=to_email,
        subject="Booking request update",
        body="\n".join(lines),
        html_body=_html_shell("Booking request update", lines),
        req=req,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_REJECTED,
        recipient_role="guest" if req.is_guest_checkout else "member",
        recipient_user_id=req.user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_booking_payment_failed_email(
    db: Session,
    req: "BookingRequest",
    space: "Space",
    location: "Location | None" = None,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage | None:
    to_email = _requester_email(db, req)
    if not to_email:
        return
    name = _requester_name(db, req)
    reason = None
    try:
        from app.models.payment import Payment

        payment = (
            db.query(Payment)
            .filter(Payment.booking_request_id == req.id)
            .order_by(Payment.created_at.desc())
            .first()
        )
        reason = payment.failure_reason if payment else None
    except Exception:  # noqa: BLE001 - email should still be queued if lookup fails.
        reason = None
    deadline = _format_retry_deadline(req)
    lines = [
        f"Hi {name},",
        f"We could not charge the saved payment method for your booking request at {space.name}.",
        f"Reference: {req.public_id}",
        f"Reason: {reason or 'The payment processor declined the charge.'}",
    ]
    if deadline:
        if req.instant_booking:
            lines.append(f"We are holding this booking until {deadline}. Update your card and retry before then.")
        else:
            lines.append(f"We are holding this booking until {deadline}. Update your card so the owner can retry before then.")
    else:
        lines.append("This booking was not held. Start a new request if you still want this time.")
    return send_booking_transactional_email(
        db=db,
        to_email=to_email,
        subject="Booking payment failed",
        body="\n".join(lines),
        html_body=_html_shell("Booking payment failed", lines),
        req=req,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_PAYMENT_FAILED,
        recipient_role="guest" if req.is_guest_checkout else "member",
        recipient_user_id=req.user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_owner_booking_cancelled_notification(
    db: Session,
    owner_email: str,
    req: "BookingRequest",
    space: "Space",
    location: "Location",
    *,
    booking: "Booking | None" = None,
    reason: str | None = None,
    recipient_role: str = "owner",
    recipient_user_id: int | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage:
    requester_email = _requester_email(db, req)
    requester = _requester_name(db, req)
    if requester_email:
        requester = f"{requester} ({requester_email})"
    lines = [
        f"Booking cancelled for {requester}.",
        f"Reference: {req.public_id}",
        f"Space: {space.name}",
        f"Location: {location.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
    ]
    if booking:
        lines.insert(2, f"Booking: {booking.public_id}")
    if reason:
        lines.append(f"Reason: {reason}")
    request_url = _frontend_url(f"/owner/requests?request={req.public_id}")
    body = "\n".join(lines + ["", f"View request: {request_url}"])
    html = _html_shell("Booking cancelled", lines, [("View request", request_url, "#374151")])
    return send_booking_transactional_email(
        db=db,
        to_email=owner_email,
        subject="Booking cancelled",
        body=body,
        html_body=html,
        req=req,
        booking=booking,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_OWNER_CANCELLED,
        recipient_role=recipient_role,
        recipient_user_id=recipient_user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_booking_cancelled_email(
    db: Session,
    booking: "Booking",
    req: "BookingRequest | None",
    space: "Space",
    location: "Location",
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage | None:
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
    return send_booking_transactional_email(
        db=db,
        to_email=to_email,
        subject="Booking canceled",
        body="\n".join(lines),
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
        req=req,
        booking=booking,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_CANCELLED,
        recipient_role=("guest" if req and req.is_guest_checkout else "member"),
        recipient_user_id=req.user_id if req else booking.user_id,
        actor_user_id=actor_user_id,
        resend=resend,
    )


def send_booking_request_cancelled_email(
    db: Session,
    req: "BookingRequest",
    space: "Space",
    location: "Location | None" = None,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> OutboundMessage | None:
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
    return send_booking_transactional_email(
        db=db,
        to_email=to_email,
        subject="Booking request canceled",
        body="\n".join(lines),
        html_body=_html_shell("Booking request canceled", lines),
        req=req,
        space=space,
        location=location,
        notification_type=BOOKING_EMAIL_REQUEST_CANCELLED,
        recipient_role="guest" if req.is_guest_checkout else "member",
        recipient_user_id=req.user_id,
        actor_user_id=actor_user_id,
        resend=resend,
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
