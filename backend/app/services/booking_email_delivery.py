from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.booking_request import BookingRequest
from app.models.marketing import OutboundMessage

BOOKING_EMAIL_REQUEST_SUBMITTED = "request_submitted"
BOOKING_EMAIL_OWNER_REQUEST = "owner_booking_request"
BOOKING_EMAIL_OWNER_CONFIRMED = "owner_confirmed_booking"
BOOKING_EMAIL_CONFIRMED = "booking_confirmed"
BOOKING_EMAIL_REJECTED = "booking_rejected"
BOOKING_EMAIL_PAYMENT_FAILED = "payment_failed"
BOOKING_EMAIL_CANCELLED = "booking_cancelled"
BOOKING_EMAIL_REQUEST_CANCELLED = "booking_request_cancelled"

BOOKING_EMAIL_TYPES = {
    BOOKING_EMAIL_REQUEST_SUBMITTED,
    BOOKING_EMAIL_OWNER_REQUEST,
    BOOKING_EMAIL_OWNER_CONFIRMED,
    BOOKING_EMAIL_CONFIRMED,
    BOOKING_EMAIL_REJECTED,
    BOOKING_EMAIL_PAYMENT_FAILED,
    BOOKING_EMAIL_CANCELLED,
    BOOKING_EMAIL_REQUEST_CANCELLED,
}

BOOKING_EMAIL_LABELS = {
    BOOKING_EMAIL_REQUEST_SUBMITTED: "Request submitted",
    BOOKING_EMAIL_OWNER_REQUEST: "Owner approval request",
    BOOKING_EMAIL_OWNER_CONFIRMED: "Owner confirmed booking",
    BOOKING_EMAIL_CONFIRMED: "Booking confirmed",
    BOOKING_EMAIL_REJECTED: "Booking rejected",
    BOOKING_EMAIL_PAYMENT_FAILED: "Payment failed",
    BOOKING_EMAIL_CANCELLED: "Booking canceled",
    BOOKING_EMAIL_REQUEST_CANCELLED: "Request canceled",
}

VISIBLE_STATUSES = {"queued", "sent", "delivered", "opened", "clicked", "bounced", "failed"}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def booking_outbounds_for_request(db: Session, req: BookingRequest) -> list[OutboundMessage]:
    rows = (
        db.query(OutboundMessage)
        .filter(
            OutboundMessage.source == "booking",
            OutboundMessage.tenant_id == req.tenant_id,
        )
        .order_by(OutboundMessage.created_at.desc(), OutboundMessage.id.desc())
        .all()
    )
    return [
        row
        for row in rows
        if (row.source_context or {}).get("booking_request_public_id") == req.public_id
    ]


def expected_notification_types(req: BookingRequest) -> list[str]:
    status = getattr(req.status, "value", req.status)
    types: list[str] = []
    if not req.instant_booking:
        types.extend([BOOKING_EMAIL_REQUEST_SUBMITTED, BOOKING_EMAIL_OWNER_REQUEST])

    if status == "approved":
        types.append(BOOKING_EMAIL_CONFIRMED)
        if req.instant_booking:
            types.append(BOOKING_EMAIL_OWNER_CONFIRMED)
    elif status == "rejected":
        types.append(BOOKING_EMAIL_REJECTED)
    elif status == "payment_failed":
        types.append(BOOKING_EMAIL_PAYMENT_FAILED)
    elif status == "cancelled":
        types.append(BOOKING_EMAIL_CANCELLED if req.booking_id else BOOKING_EMAIL_REQUEST_CANCELLED)
    return types


def _row_time(row: OutboundMessage) -> tuple[datetime, int]:
    return (row.created_at or datetime.min.replace(tzinfo=timezone.utc), row.id or 0)


def _latest_by_recipient(rows: list[OutboundMessage]) -> list[OutboundMessage]:
    latest: dict[str, OutboundMessage] = {}
    for row in rows:
        current = latest.get(row.email)
        if current is None or _row_time(row) > _row_time(current):
            latest[row.email] = row
    return list(latest.values())


def rollup_status(rows: list[OutboundMessage]) -> str:
    if not rows:
        return "not_sent"
    latest = _latest_by_recipient(rows)
    statuses = {row.status for row in latest}
    if "failed" in statuses:
        return "failed"
    if "bounced" in statuses:
        return "bounced"
    if statuses and statuses.issubset({"delivered", "opened", "clicked"}):
        return "delivered"
    if "sent" in statuses:
        return "sent"
    if "queued" in statuses:
        return "queued"
    return next(iter(statuses), "not_sent")


def safe_error_label(row: OutboundMessage | None) -> str | None:
    if not row or row.status not in {"failed", "bounced"}:
        return None
    context = row.source_context or {}
    diagnostic = context.get("diagnostic")
    if diagnostic == "sendgrid_not_configured":
        return "Email provider is not configured"
    if row.status == "bounced":
        return "Email bounced"
    return "Send failed"


def delivery_summary_for_request(
    db: Session,
    req: BookingRequest,
    *,
    include_recipients: bool = False,
) -> list[dict[str, Any]]:
    rows = booking_outbounds_for_request(db, req)
    by_type: dict[str, list[OutboundMessage]] = {}
    for row in rows:
        notification_type = (row.source_context or {}).get("notification_type")
        if notification_type:
            by_type.setdefault(str(notification_type), []).append(row)

    types = list(dict.fromkeys(expected_notification_types(req) + list(by_type.keys())))
    summary: list[dict[str, Any]] = []
    for notification_type in types:
        type_rows = by_type.get(notification_type, [])
        latest = max(type_rows, key=_row_time) if type_rows else None
        latest_per_recipient = _latest_by_recipient(type_rows)
        item = {
            "notification_type": notification_type,
            "label": BOOKING_EMAIL_LABELS.get(notification_type, notification_type.replace("_", " ").title()),
            "status": rollup_status(type_rows),
            "attempt_count": len(type_rows),
            "recipient_count": len({row.email for row in type_rows}),
            "failed_count": sum(1 for row in latest_per_recipient if row.status in {"failed", "bounced"}),
            "last_attempt_at": latest.created_at if latest else None,
            "last_error": safe_error_label(latest),
            "recipients": sorted({row.email for row in type_rows}) if include_recipients else [],
        }
        summary.append(item)
    return summary


def delivery_details_for_request(
    db: Session,
    req: BookingRequest,
    *,
    include_raw_error: bool = False,
) -> list[dict[str, Any]]:
    rows = booking_outbounds_for_request(db, req)
    details: list[dict[str, Any]] = []
    for row in rows:
        context = row.source_context or {}
        item = {
            "public_id": row.public_id,
            "notification_type": context.get("notification_type") or "",
            "label": BOOKING_EMAIL_LABELS.get(
                str(context.get("notification_type") or ""),
                str(context.get("notification_type") or "").replace("_", " ").title(),
            ),
            "recipient_email": row.email,
            "recipient_role": context.get("recipient_role"),
            "subject": row.subject,
            "status": row.status if row.status in VISIBLE_STATUSES else "queued",
            "provider_message_id": row.provider_message_id,
            "error_label": safe_error_label(row),
            "error": row.error if include_raw_error else None,
            "sent_at": row.sent_at,
            "last_event_at": row.last_event_at,
            "created_at": row.created_at,
        }
        details.append(item)
    return details
