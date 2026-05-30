from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.marketing import MarketingTemplate
from app.models.org_member_profile import OrgMemberProfile
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.space import Space
from app.models.user import User
from app.services.booking_email_delivery import (
    BOOKING_EMAIL_CANCELLED,
    BOOKING_EMAIL_CARD_EXPIRING,
    BOOKING_EMAIL_CONFIRMED,
    BOOKING_EMAIL_INVOICE_RECEIPT,
    BOOKING_EMAIL_PAYMENT_FAILED,
    BOOKING_EMAIL_REMINDER,
    BOOKING_EMAIL_REQUEST_CANCELLED,
    BOOKING_EMAIL_REQUEST_SUBMITTED,
    BOOKING_EMAIL_WELCOME,
)
from app.services.template_rendering import ensure_template_allowed, render_template_sources

logger = logging.getLogger("transactional_templates")

TRANSACTIONAL_TEMPLATE_CATEGORY = "transactional"

TEMPLATE_WELCOME_LETTER = "welcome_letter"
TEMPLATE_BOOKING_REQUEST_RECEIVED = "booking_request_received"
TEMPLATE_RESERVATION_CONFIRMATION = "reservation_confirmation"
TEMPLATE_RESERVATION_REMINDER = "reservation_reminder"
TEMPLATE_INVOICE_RECEIPT = "invoice_receipt"
TEMPLATE_PAYMENT_FAILED = "payment_failed"
TEMPLATE_CARD_EXPIRING = "card_expiring"
TEMPLATE_RESERVATION_UPDATE = "reservation_update"

NOTIFICATION_TEMPLATE_CLASSIFICATIONS = {
    BOOKING_EMAIL_REQUEST_SUBMITTED: TEMPLATE_BOOKING_REQUEST_RECEIVED,
    BOOKING_EMAIL_CONFIRMED: TEMPLATE_RESERVATION_CONFIRMATION,
    BOOKING_EMAIL_PAYMENT_FAILED: TEMPLATE_PAYMENT_FAILED,
    BOOKING_EMAIL_CANCELLED: TEMPLATE_RESERVATION_UPDATE,
    BOOKING_EMAIL_REQUEST_CANCELLED: TEMPLATE_RESERVATION_UPDATE,
    BOOKING_EMAIL_WELCOME: TEMPLATE_WELCOME_LETTER,
    BOOKING_EMAIL_REMINDER: TEMPLATE_RESERVATION_REMINDER,
    BOOKING_EMAIL_INVOICE_RECEIPT: TEMPLATE_INVOICE_RECEIPT,
    BOOKING_EMAIL_CARD_EXPIRING: TEMPLATE_CARD_EXPIRING,
}


@dataclass(frozen=True)
class DefaultTransactionalTemplate:
    classification: str
    name: str
    subject: str
    html_body: str
    text_body: str


@dataclass
class RenderedTransactionalEmail:
    subject: str
    html_body: str | None
    text_body: str
    template: MarketingTemplate | None = None
    fallback_reason: str | None = None


DEFAULT_TRANSACTIONAL_TEMPLATES = [
    DefaultTransactionalTemplate(
        classification=TEMPLATE_WELCOME_LETTER,
        name="Welcome letter",
        subject="Welcome to {{ business.name }}, {{ member.first_name }}",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>Welcome to {{ business.name }}. Your first reservation is confirmed and we are glad to have you with us.</p>"
            "<p>{{ location.name }} is located at {{ location.address }}.</p>"
            "<p>If you need anything, contact {{ owner.full_name }} at {{ owner.email }}.</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "Welcome to {{ business.name }}. Your first reservation is confirmed and we are glad to have you with us.\n\n"
            "{{ location.name }} is located at {{ location.address }}.\n\n"
            "If you need anything, contact {{ owner.full_name }} at {{ owner.email }}."
        ),
    ),
    DefaultTransactionalTemplate(
        classification=TEMPLATE_BOOKING_REQUEST_RECEIVED,
        name="Booking request received",
        subject="We received your reservation request",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>We received your request for {{ booking.space_name }} at {{ booking.location_name }}.</p>"
            "<p>From: {{ booking.start_date }} {{ booking.start_time }}<br>To: {{ booking.end_date }} {{ booking.end_time }}</p>"
            "<p>Reference: {{ booking.request_number }}</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "We received your request for {{ booking.space_name }} at {{ booking.location_name }}.\n"
            "From: {{ booking.start_date }} {{ booking.start_time }}\n"
            "To: {{ booking.end_date }} {{ booking.end_time }}\n"
            "Reference: {{ booking.request_number }}"
        ),
    ),
    DefaultTransactionalTemplate(
        classification=TEMPLATE_RESERVATION_CONFIRMATION,
        name="Reservation confirmation",
        subject="Your reservation is confirmed",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>Your reservation for {{ booking.space_name }} is confirmed.</p>"
            "<p>{{ booking.start_date }} {{ booking.start_time }} to {{ booking.end_date }} {{ booking.end_time }}</p>"
            "<p>Location: {{ location.name }}, {{ location.address }}</p>"
            "<p>Reference: {{ booking.number }}</p>"
            "<p>Access pass: {{ links.access_pass }}</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "Your reservation for {{ booking.space_name }} is confirmed.\n"
            "{{ booking.start_date }} {{ booking.start_time }} to {{ booking.end_date }} {{ booking.end_time }}\n"
            "Location: {{ location.name }}, {{ location.address }}\n"
            "Reference: {{ booking.number }}\n"
            "Access pass: {{ links.access_pass }}"
        ),
    ),
    DefaultTransactionalTemplate(
        classification=TEMPLATE_RESERVATION_REMINDER,
        name="Reservation reminder",
        subject="Reminder: your reservation starts soon",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>Your reservation at {{ booking.location_name }} starts at {{ booking.start_time }}.</p>"
            "<p>Space: {{ booking.space_name }}<br>Date: {{ booking.start_date }}</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "Your reservation at {{ booking.location_name }} starts at {{ booking.start_time }}.\n"
            "Space: {{ booking.space_name }}\n"
            "Date: {{ booking.start_date }}"
        ),
    ),
    DefaultTransactionalTemplate(
        classification=TEMPLATE_INVOICE_RECEIPT,
        name="Invoice and payment receipt",
        subject="Your receipt from {{ business.name }}",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>Your payment of {{ payment.amount }} was recorded.</p>"
            "<p>Invoice: {{ invoice.number }}<br>Status: {{ invoice.status }}</p>"
            "<p>View invoice: {{ links.invoice }}</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "Your payment of {{ payment.amount }} was recorded.\n"
            "Invoice: {{ invoice.number }}\n"
            "Status: {{ invoice.status }}\n"
            "View invoice: {{ links.invoice }}"
        ),
    ),
    DefaultTransactionalTemplate(
        classification=TEMPLATE_PAYMENT_FAILED,
        name="Payment failed or card declined",
        subject="Payment could not be processed",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>We could not process your payment with {{ business.name }}.</p>"
            "<p>Reason: {{ payment.failure_reason }}</p>"
            "<p>Update your card or retry payment: {{ links.retry_payment }}</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "We could not process your payment with {{ business.name }}.\n"
            "Reason: {{ payment.failure_reason }}\n"
            "Update your card or retry payment: {{ links.retry_payment }}"
        ),
    ),
    DefaultTransactionalTemplate(
        classification=TEMPLATE_CARD_EXPIRING,
        name="Card expiring or expired notice",
        subject="Update your card for {{ business.name }}",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>Your {{ card.brand }} card ending in {{ card.last4 }} expires {{ card.expiry }}.</p>"
            "<p>Please update your payment method to avoid interrupted reservations or memberships.</p>"
            "<p>Update card: {{ links.update_payment_method }}</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "Your {{ card.brand }} card ending in {{ card.last4 }} expires {{ card.expiry }}.\n"
            "Please update your payment method to avoid interrupted reservations or memberships.\n"
            "Update card: {{ links.update_payment_method }}"
        ),
    ),
    DefaultTransactionalTemplate(
        classification=TEMPLATE_RESERVATION_UPDATE,
        name="Reservation canceled or changed",
        subject="Reservation update from {{ business.name }}",
        html_body=(
            "<p>Hi {{ member.first_name }},</p>"
            "<p>Your reservation has been updated.</p>"
            "<p>Space: {{ booking.space_name }}<br>Reference: {{ booking.request_number }}</p>"
            "<p>Contact {{ business.support_email }} with questions.</p>"
        ),
        text_body=(
            "Hi {{ member.first_name }},\n\n"
            "Your reservation has been updated.\n"
            "Space: {{ booking.space_name }}\n"
            "Reference: {{ booking.request_number }}\n"
            "Contact {{ business.support_email }} with questions."
        ),
    ),
]


def ensure_default_transactional_templates(db: Session, org: Organization, *, actor_id: int | None = None) -> int:
    created = 0
    for default in DEFAULT_TRANSACTIONAL_TEMPLATES:
        existing = (
            db.query(MarketingTemplate)
            .filter(
                MarketingTemplate.organization_id == org.id,
                MarketingTemplate.category == TRANSACTIONAL_TEMPLATE_CATEGORY,
                MarketingTemplate.classification == default.classification,
            )
            .first()
        )
        if existing:
            continue
        template = MarketingTemplate(
            organization_id=org.id,
            tenant_id=org.id,
            name=default.name,
            subject=default.subject,
            html_body=default.html_body,
            text_body=default.text_body,
            category=TRANSACTIONAL_TEMPLATE_CATEGORY,
            classification=default.classification,
            variables=ensure_template_allowed(default.subject, default.html_body, default.text_body),
            created_by_user_id=actor_id,
            updated_by_user_id=actor_id,
        )
        db.add(template)
        created += 1
    if created:
        db.commit()
    return created


def _format_date(value: datetime | None) -> str:
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    value = value.astimezone(timezone.utc)
    return f"{value:%b} {value.day}, {value.year}"


def _format_time(value: datetime | None) -> str:
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%I:%M %p UTC").lstrip("0")


def _format_money(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0
    return f"${amount:,.2f}"


def _frontend_url(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _merge_context(base: dict[str, Any], extra: dict[str, Any] | None) -> dict[str, Any]:
    if not extra:
        return base
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            base[key] = _merge_context(dict(base[key]), value)
        else:
            base[key] = value
    return base


def build_transactional_context(
    db: Session,
    *,
    organization_id: int,
    to_email: str = "",
    user_id: int | None = None,
    req: BookingRequest | None = None,
    booking: Booking | None = None,
    space: Space | None = None,
    location: Location | None = None,
    invoice: Invoice | None = None,
    payment: Payment | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    user = db.query(User).filter(User.id == user_id).first() if user_id else None
    if not user and to_email:
        user = db.query(User).filter(User.email == to_email).first()
    owner = db.query(User).filter(User.id == org.owner_id).first() if org else None
    if not space and booking:
        space = db.query(Space).filter(Space.id == booking.space_id).first()
    if not space and req:
        space = db.query(Space).filter(Space.id == req.space_id).first()
    if not location and space:
        location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location and org:
        location = db.query(Location).filter(Location.organization_id == org.id).order_by(Location.id.asc()).first()
    if not invoice and payment:
        invoice = db.query(Invoice).filter(Invoice.payment_id == payment.id).first()
    if not payment and invoice and invoice.payment_id:
        payment = db.query(Payment).filter(Payment.id == invoice.payment_id).first()

    record = None
    if user and org:
        record = (
            db.query(OrgMemberProfile)
            .filter(OrgMemberProfile.organization_id == org.id, OrgMemberProfile.user_id == user.id)
            .first()
        )

    start = req.start_datetime if req else booking.start_datetime if booking else None
    end = req.end_datetime if req else booking.end_datetime if booking else None
    booking_public_id = booking.public_id if booking else ""
    request_public_id = req.public_id if req else ""
    booking_link_id = request_public_id or booking_public_id
    invoice_number = invoice.public_id if invoice else ""
    invoice_link = invoice.pdf_url if invoice and invoice.pdf_url else (
        _frontend_url(f"/member/invoices?invoice={invoice_number}") if invoice_number else ""
    )

    member_first = user.first_name if user else ""
    member_last = user.last_name if user else ""
    member_full = (user.full_name or f"{member_first or ''} {member_last or ''}".strip() or user.email) if user else ""
    owner_first = owner.first_name if owner else ""
    owner_last = owner.last_name if owner else ""
    owner_full = (owner.full_name or f"{owner_first or ''} {owner_last or ''}".strip() or owner.email) if owner else ""
    support_email = location.public_email if location and location.public_email else settings.SENDGRID_FROM_EMAIL
    location_phone = location.public_phone if location and location.public_phone else ""
    location_address = location.address if location else ""

    context = {
        "member": {
            "first_name": member_first,
            "last_name": member_last,
            "full_name": member_full,
            "email": user.email if user else to_email,
            "phone": (record.phone if record and record.phone else user.phone if user else "") or "",
            "company": record.company_name if record and record.company_name else "",
        },
        "owner": {
            "first_name": owner_first,
            "last_name": owner_last,
            "full_name": owner_full,
            "email": owner.email if owner else "",
            "phone": owner.phone if owner and owner.phone else "",
        },
        "business": {
            "name": org.name if org else "",
            "support_email": support_email or "",
            "phone": location_phone,
            "address": location_address,
            "city": location.city if location and location.city else "",
            "state": location.state if location and location.state else "",
            "postal_code": location.postal_code if location and location.postal_code else "",
            "website": org.website if org and org.website else "",
        },
        "location": {
            "name": location.name if location else "",
            "address": location_address,
            "city": location.city if location and location.city else "",
            "state": location.state if location and location.state else "",
            "postal_code": location.postal_code if location and location.postal_code else "",
            "phone": location_phone,
            "email": support_email or "",
            "timezone": location.timezone if location else "",
        },
        "booking": {
            "number": booking_public_id,
            "request_number": request_public_id,
            "start_date": _format_date(start),
            "end_date": _format_date(end),
            "start_time": _format_time(start),
            "end_time": _format_time(end),
            "space_name": space.name if space and space.name else "",
            "location_name": location.name if location else "",
            "link": _frontend_url(f"/member/requests/{booking_link_id}") if booking_link_id else "",
            "access_pass_link": "",
        },
        "space": {
            "name": space.name if space and space.name else "",
            "type": getattr(space.space_type, "value", space.space_type) if space else "",
            "capacity": str(space.capacity or "") if space else "",
            "location_name": location.name if location else "",
        },
        "membership": {
            "name": "",
            "status": "",
            "renewal_date": "",
            "expiry_date": "",
        },
        "invoice": {
            "number": invoice_number,
            "amount": _format_money(invoice.amount if invoice else payment.amount if payment else 0),
            "balance_due": _format_money(invoice.amount if invoice and invoice.status != "paid" else 0),
            "due_date": "",
            "link": invoice_link,
            "status": invoice.status if invoice else "",
        },
        "payment": {
            "amount": _format_money(payment.amount if payment else invoice.amount if invoice else 0),
            "status": getattr(payment.status, "value", payment.status) if payment else "",
            "failure_reason": payment.failure_reason if payment and payment.failure_reason else "The payment processor declined the charge.",
            "provider": payment.provider if payment else "",
        },
        "card": {
            "brand": "",
            "last4": "",
            "exp_month": "",
            "exp_year": "",
            "expiry": "",
        },
        "links": {
            "unsubscribe": "",
            "view_in_browser": "",
            "booking": _frontend_url(f"/member/requests/{booking_link_id}") if booking_link_id else "",
            "invoice": invoice_link,
            "retry_payment": _frontend_url(f"/member/requests/{booking_link_id}") if booking_link_id else "",
            "update_payment_method": _frontend_url("/member/payments"),
            "access_pass": "",
        },
    }
    return _merge_context(context, extra)


def render_transactional_email(
    db: Session,
    *,
    organization_id: int,
    notification_type: str,
    default_subject: str,
    default_text_body: str,
    default_html_body: str | None,
    to_email: str = "",
    user_id: int | None = None,
    req: BookingRequest | None = None,
    booking: Booking | None = None,
    space: Space | None = None,
    location: Location | None = None,
    invoice: Invoice | None = None,
    payment: Payment | None = None,
    extra_context: dict[str, Any] | None = None,
) -> RenderedTransactionalEmail:
    classification = NOTIFICATION_TEMPLATE_CLASSIFICATIONS.get(notification_type)
    if not classification or organization_id <= 0:
        return RenderedTransactionalEmail(default_subject, default_html_body, default_text_body)

    template = (
        db.query(MarketingTemplate)
        .filter(
            MarketingTemplate.organization_id == organization_id,
            MarketingTemplate.category == TRANSACTIONAL_TEMPLATE_CATEGORY,
            MarketingTemplate.classification == classification,
            MarketingTemplate.is_archived.is_(False),
        )
        .order_by(MarketingTemplate.updated_at.desc(), MarketingTemplate.id.desc())
        .first()
    )
    if not template:
        return RenderedTransactionalEmail(default_subject, default_html_body, default_text_body)

    context = build_transactional_context(
        db,
        organization_id=organization_id,
        to_email=to_email,
        user_id=user_id,
        req=req,
        booking=booking,
        space=space,
        location=location,
        invoice=invoice,
        payment=payment,
        extra=extra_context,
    )
    subject, html, text, missing = render_template_sources(
        subject=template.subject,
        html_body=template.html_body,
        text_body=template.text_body,
        context=context,
    )
    if missing:
        reason = "; ".join(missing)
        logger.warning(
            "transactional template render fallback organization_id=%s template=%s reason=%s",
            organization_id,
            template.public_id,
            reason,
        )
        return RenderedTransactionalEmail(
            default_subject,
            default_html_body,
            default_text_body,
            template=template,
            fallback_reason=reason,
        )

    return RenderedTransactionalEmail(
        subject=subject,
        html_body=html,
        text_body=text or default_text_body,
        template=template,
    )
