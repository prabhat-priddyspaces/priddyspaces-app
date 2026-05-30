from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import BookingStatus, PaymentStatus
from app.models.invoice import Invoice
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.payment_event import PaymentEvent
from app.models.subscription import Subscription
from app.models.user import User
from app.services.booking_email_delivery import BOOKING_EMAIL_PAYMENT_FAILED
from app.services.booking_payments import finalize_successful_booking_request_payment
from app.services.invoices import generate_invoice_pdf
from app.services.loyalty import record_earned_for_payment, reverse_for_payment_refund
from app.services.notifications import send_booking_transactional_email, send_invoice_receipt_email
from app.services.platform_auth import calculate_commission_snapshot, get_effective_commission_pct
from app.services.access_passes import ensure_access_pass_for_booking
from app.services.storage import upload_invoice_pdf

SUPPORTED_EVENTS = {
    "invoice.paid",
    "invoice.payment_failed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "charge.refunded",
    "payment_method.detached",
    "customer.source.expiring",
}


def _amount_from_stripe(raw_amount: Any) -> int:
    if raw_amount in (None, ""):
        return 0
    return int(round(float(raw_amount) / 100))


def _safe_pdf_url(payload: dict[str, Any], filename: str) -> str | None:
    try:
        pdf_bytes = generate_invoice_pdf(payload)
    except RuntimeError:
        return None
    return upload_invoice_pdf(pdf_bytes, filename)


def _upsert_invoice(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    payment: Payment,
    amount: int,
    status: str,
    invoice_payload: dict[str, Any] | None = None,
) -> Invoice:
    invoice = db.query(Invoice).filter(Invoice.payment_id == payment.id).first()
    if not invoice:
        invoice = Invoice(
            tenant_id=tenant_id,
            user_id=user_id,
            booking_id=payment.booking_id,
            payment_id=payment.id,
            amount=amount,
            status=status,
            pdf_url=None,
        )
    else:
        invoice.amount = amount
        invoice.status = status

    invoice.commission_rate_pct = payment.commission_rate_pct
    invoice.platform_fee_amount = payment.platform_fee_amount
    invoice.owner_net_amount = payment.owner_net_amount

    if invoice_payload and not invoice.pdf_url:
        invoice.pdf_url = _safe_pdf_url(invoice_payload, f"{payment.public_id}.pdf")

    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def _upsert_subscription_payment(
    db: Session,
    subscription: Subscription,
    data: dict[str, Any],
    status: PaymentStatus,
) -> Payment:
    payment_key = data.get("payment_intent") or f"invoice:{data.get('id')}"
    payment = db.query(Payment).filter(Payment.stripe_payment_intent_id == payment_key).first()
    amount = _amount_from_stripe(data.get("amount_paid") or data.get("amount_due"))
    if not payment:
        payment = Payment(
            user_id=subscription.user_id,
            subscription_id=subscription.id,
            tenant_id=subscription.tenant_id,
            amount=amount,
            provider="stripe",
            status=status,
            stripe_payment_intent_id=payment_key,
        )
    else:
        payment.user_id = subscription.user_id
        payment.subscription_id = subscription.id
        payment.tenant_id = subscription.tenant_id
        payment.amount = amount
        payment.provider = "stripe"
        payment.status = status

    if payment.tenant_id is not None and payment.status == PaymentStatus.SUCCEEDED:
        organization = db.query(Organization).filter(Organization.id == payment.tenant_id).first()
        commission_pct = get_effective_commission_pct(db, organization)
        platform_fee, owner_net = calculate_commission_snapshot(payment.amount or 0, commission_pct)
        payment.commission_rate_pct = commission_pct
        payment.platform_fee_amount = platform_fee
        payment.owner_net_amount = owner_net

    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def _metadata(data: dict[str, Any]) -> dict[str, Any]:
    metadata = data.get("metadata") or {}
    return metadata if isinstance(metadata, dict) else {}


def _latest_payment_for_request(db: Session, req: BookingRequest, payment_intent_id: str | None) -> Payment | None:
    if payment_intent_id:
        payment = db.query(Payment).filter(Payment.stripe_payment_intent_id == payment_intent_id).first()
        if payment:
            return payment
        payment = db.query(Payment).filter(Payment.provider_payment_id == payment_intent_id).first()
        if payment:
            return payment
    return (
        db.query(Payment)
        .filter(Payment.booking_request_id == req.id)
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .first()
    )


def _payment_from_request_intent(db: Session, req: BookingRequest, data: dict[str, Any]) -> Payment:
    payment_intent_id = data.get("id")
    payment = _latest_payment_for_request(db, req, payment_intent_id)
    if payment:
        return payment

    amount_cents = int(data.get("amount") or 0)
    payment = Payment(
        user_id=req.user_id,
        booking_request_id=req.id,
        booking_id=req.booking_id,
        tenant_id=req.tenant_id,
        amount=amount_cents // 100,
        amount_cents=amount_cents,
        currency=(data.get("currency") or "usd")[:3],
        provider="stripe",
        payment_method_id=req.member_owner_payment_method_id,
        status=PaymentStatus.REQUIRES_PAYMENT,
        attempt_number=max(1, req.payment_attempt_count or 1),
        stripe_payment_intent_id=payment_intent_id,
        provider_payment_id=payment_intent_id,
    )
    db.add(payment)
    db.flush()
    return payment


def _handle_booking_request_payment_success(db: Session, req: BookingRequest, data: dict[str, Any]) -> Payment:
    payment_intent_id = data.get("id")
    payment = _payment_from_request_intent(db, req, data)
    _req, booking, payment = finalize_successful_booking_request_payment(
        db,
        req=req,
        payment=payment,
        provider_payment_id=payment_intent_id,
        provider_reference_id=data.get("latest_charge"),
        raw_response=data,
    )
    return payment


def _handle_booking_payment_success(db: Session, data: dict[str, Any], tenant_id: int | None) -> None:
    payment_intent_id = data.get("id")
    booking_request_public_id = _metadata(data).get("booking_request_public_id")
    if booking_request_public_id:
        req = db.query(BookingRequest).filter(BookingRequest.public_id == booking_request_public_id).first()
        if req:
            payment = _handle_booking_request_payment_success(db, req, data)
            customer_email = data.get("receipt_email") or ""
            if not customer_email and payment.user_id:
                customer = db.query(User).filter(User.id == payment.user_id).first()
                if customer:
                    customer_email = customer.email
            if customer_email:
                booking = db.query(Booking).filter(Booking.id == payment.booking_id).first() if payment.booking_id else None
                invoice = db.query(Invoice).filter(Invoice.payment_id == payment.id).first()
                send_invoice_receipt_email(
                    db,
                    to_email=customer_email,
                    subject="Payment receipt",
                    body=f"Your payment for booking request {req.public_id} is confirmed.",
                    organization_id=req.tenant_id,
                    user_id=payment.user_id,
                    req=req,
                    booking=booking,
                    invoice=invoice,
                    payment=payment,
                )
        return

    payment = db.query(Payment).filter(Payment.stripe_payment_intent_id == payment_intent_id).first()
    if payment:
        payment.status = PaymentStatus.SUCCEEDED
        if tenant_id is not None and not payment.tenant_id:
            payment.tenant_id = tenant_id
        if payment.tenant_id is not None:
            organization = db.query(Organization).filter(Organization.id == payment.tenant_id).first()
            commission_pct = get_effective_commission_pct(db, organization)
            platform_fee, owner_net = calculate_commission_snapshot(payment.amount or 0, commission_pct)
            payment.commission_rate_pct = commission_pct
            payment.platform_fee_amount = platform_fee
            payment.owner_net_amount = owner_net
        db.add(payment)
        db.commit()
        db.refresh(payment)

    booking_public_id = _metadata(data).get("booking_public_id")
    if not booking_public_id:
        return

    booking = db.query(Booking).filter(Booking.public_id == booking_public_id).first()
    if not booking:
        return

    booking.status = BookingStatus.CONFIRMED
    db.add(booking)
    ensure_access_pass_for_booking(db, booking)
    db.commit()
    db.refresh(booking)

    if not payment:
        return

    customer_email = data.get("receipt_email") or ""
    if not customer_email and payment.user_id:
        customer = db.query(User).filter(User.id == payment.user_id).first()
        if customer:
            customer_email = customer.email

    invoice_payload = {
        "invoice_number": f"INV-{payment.public_id}",
        "issued_at": booking.start_datetime.date().isoformat(),
        "member_email": customer_email,
        "booking_public_id": booking.public_id,
        "description": "Workspace booking payment",
        "amount": payment.amount or 0,
    }
    _upsert_invoice(
        db,
        tenant_id=booking.tenant_id,
        user_id=payment.user_id,
        payment=payment,
        amount=payment.amount or 0,
        status="issued",
        invoice_payload=invoice_payload,
    )
    record_earned_for_payment(db, payment, booking=booking)
    if customer_email:
        send_invoice_receipt_email(
            db,
            to_email=customer_email,
            subject="Payment receipt",
            body=f"Your payment for booking {booking.public_id} is confirmed.",
            organization_id=booking.tenant_id,
            user_id=payment.user_id,
            booking=booking,
            invoice=db.query(Invoice).filter(Invoice.payment_id == payment.id).first(),
            payment=payment,
        )


def _handle_subscription_invoice_event(db: Session, event_type: str, data: dict[str, Any]) -> None:
    subscription_id = data.get("subscription")
    if not subscription_id:
        return

    subscription = db.query(Subscription).filter(Subscription.stripe_subscription_id == subscription_id).first()
    if not subscription:
        return

    is_paid = event_type == "invoice.paid"
    subscription.status = "active" if is_paid else "past_due"
    db.add(subscription)
    db.commit()
    db.refresh(subscription)

    payment = _upsert_subscription_payment(
        db,
        subscription,
        data,
        PaymentStatus.SUCCEEDED if is_paid else PaymentStatus.FAILED,
    )

    customer = db.query(User).filter(User.id == subscription.user_id).first()
    customer_email = customer.email if customer else ""
    issued_at = datetime.now(timezone.utc).date().isoformat()
    if data.get("created"):
        issued_at = datetime.fromtimestamp(data["created"], tz=timezone.utc).date().isoformat()

    invoice_payload = {
        "invoice_number": data.get("number") or f"INV-{payment.public_id}",
        "issued_at": issued_at,
        "member_email": customer_email,
        "subscription_public_id": subscription.public_id,
        "description": "Workspace membership charge",
        "amount": payment.amount or 0,
    }
    invoice = _upsert_invoice(
        db,
        tenant_id=subscription.tenant_id,
        user_id=subscription.user_id,
        payment=payment,
        amount=payment.amount or 0,
        status="paid" if is_paid else "payment_failed",
        invoice_payload=invoice_payload if is_paid else None,
    )
    if is_paid:
        record_earned_for_payment(db, payment)

    if not customer_email:
        return

    if is_paid:
        send_invoice_receipt_email(
            db,
            to_email=customer_email,
            subject="Membership payment received",
            body=f"Your membership payment was recorded. Invoice {invoice.public_id} is available.",
            organization_id=subscription.tenant_id,
            user_id=subscription.user_id,
            invoice=invoice,
            payment=payment,
        )
    else:
        send_booking_transactional_email(
            db=db,
            to_email=customer_email,
            subject="Membership payment failed",
            body="We could not process your membership payment. Please update your billing details.",
            html_body=None,
            invoice=invoice,
            payment=payment,
            notification_type=BOOKING_EMAIL_PAYMENT_FAILED,
            recipient_role="member",
            recipient_user_id=subscription.user_id,
            organization_id=subscription.tenant_id,
            tenant_id=subscription.tenant_id,
            source="transactional",
        )


def record_event(db: Session, event: dict[str, Any], tenant_id: int | None = None) -> bool:
    event_id = event.get("id")
    event_type = event.get("type")
    if not event_id or not event_type:
        return False

    exists = db.query(PaymentEvent).filter(PaymentEvent.event_id == event_id).first()
    if exists:
        return False

    payment_event = PaymentEvent(
        event_id=event_id,
        event_type=event_type,
        payload=event,
        tenant_id=tenant_id,
    )
    db.add(payment_event)
    db.commit()
    return True


def handle_event(db: Session, event: dict[str, Any]) -> dict[str, Any]:
    event_type = event.get("type")

    if event_type not in SUPPORTED_EVENTS:
        return {"handled": False, "reason": "unsupported"}

    data = event.get("data", {}).get("object", {})
    tenant_id = None
    metadata = _metadata(data) if isinstance(data, dict) else {}
    booking_public_id = metadata.get("booking_public_id")
    booking_request_public_id = metadata.get("booking_request_public_id")
    if booking_request_public_id:
        req = db.query(BookingRequest).filter(BookingRequest.public_id == booking_request_public_id).first()
        if req:
            tenant_id = req.tenant_id
    if booking_public_id:
        booking = db.query(Booking).filter(Booking.public_id == booking_public_id).first()
        if booking:
            tenant_id = booking.tenant_id
    subscription_id = data.get("subscription") if isinstance(data, dict) else None
    if subscription_id and tenant_id is None:
        subscription = db.query(Subscription).filter(Subscription.stripe_subscription_id == subscription_id).first()
        if subscription:
            tenant_id = subscription.tenant_id

    recorded = record_event(db, event, tenant_id=tenant_id)
    if not recorded:
        return {"handled": True, "deduped": True}

    if event_type == "payment_intent.succeeded":
        _handle_booking_payment_success(db, data, tenant_id)

    if event_type == "payment_intent.payment_failed":
        payment_intent_id = data.get("id")
        payment = db.query(Payment).filter(Payment.stripe_payment_intent_id == payment_intent_id).first()
        if not payment:
            payment = db.query(Payment).filter(Payment.provider_payment_id == payment_intent_id).first()
        if payment:
            if payment.status == PaymentStatus.SUCCEEDED:
                return {"handled": True, "type": event_type, "ignored": "already_succeeded"}
            payment.status = PaymentStatus.FAILED
            if tenant_id is not None and not payment.tenant_id:
                payment.tenant_id = tenant_id
            last_error = data.get("last_payment_error") or {}
            if isinstance(last_error, dict):
                payment.failure_reason = last_error.get("message") or last_error.get("code")
            db.add(payment)
            db.commit()

    if event_type == "charge.refunded":
        payment_intent_id = data.get("payment_intent")
        if payment_intent_id:
            payment = db.query(Payment).filter(Payment.stripe_payment_intent_id == payment_intent_id).first()
            if payment:
                amount_refunded = data.get("amount_refunded") or 0
                amount_total = data.get("amount") or 0
                payment.status = PaymentStatus.REFUNDED if amount_refunded >= amount_total else PaymentStatus.VOIDED
                db.add(payment)
                db.commit()
                reverse_for_payment_refund(db, payment)

    if event_type == "payment_method.detached":
        provider_pm_id = data.get("id")
        if provider_pm_id:
            method = (
                db.query(MemberOwnerPaymentMethod)
                .filter(MemberOwnerPaymentMethod.provider_payment_method_id == provider_pm_id)
                .first()
            )
            if method:
                method.status = "detached"
                db.add(method)
                db.commit()

    if event_type == "customer.source.expiring":
        provider_pm_id = data.get("id")
        if provider_pm_id:
            method = (
                db.query(MemberOwnerPaymentMethod)
                .filter(MemberOwnerPaymentMethod.provider_payment_method_id == provider_pm_id)
                .first()
            )
            if method:
                method.status = "expiring"
                db.add(method)
                db.commit()

    if event_type in {"invoice.paid", "invoice.payment_failed"}:
        _handle_subscription_invoice_event(db, event_type, data)

    if event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
        subscription_id = data.get("subscription") or data.get("id")
        subscription = db.query(Subscription).filter(Subscription.stripe_subscription_id == subscription_id).first()
        if subscription:
            if event_type == "customer.subscription.deleted":
                subscription.status = "canceled"
            elif event_type == "customer.subscription.updated":
                subscription.status = data.get("status", subscription.status)
            db.add(subscription)
            db.commit()

    return {"handled": True, "type": event_type}
