from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.cancellation_policy import CancellationPolicy
from app.models.customer_owner_payment_method import CustomerOwnerPaymentMethod
from app.models.enums import BookingRequestStatus, BookingStatus, PaymentStatus
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.organization import Organization
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.pricing_rule import PricingRule
from app.models.space import Space
from app.models.tax_config import TaxConfig
from app.models.user import User
from app.services.notifications import send_email
from app.services.payment_providers import PaymentProviderError, PaymentProviderFactory
from app.services.platform_auth import calculate_commission_snapshot, get_effective_commission_pct
from app.services.pricing import estimate_booking_amount


def get_active_pricing_rule(db: Session, space_id: int) -> PricingRule | None:
    now = datetime.now(timezone.utc)
    return (
        db.query(PricingRule)
        .filter(
            PricingRule.space_id == space_id,
            (PricingRule.active_from.is_(None) | (PricingRule.active_from <= now)),
            (PricingRule.active_to.is_(None) | (PricingRule.active_to >= now)),
        )
        .order_by(PricingRule.created_at.desc())
        .first()
    )


def estimate_request_amount(db: Session, req: BookingRequest, space: Space) -> int:
    rule = get_active_pricing_rule(db, space.id)
    tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
    amount = estimate_booking_amount(
        req.start_datetime,
        req.end_datetime,
        space.price_daily,
        space.price_monthly,
        rate_type=rule.rate_type if rule else None,
        rate_amount=rule.rate_amount if rule else None,
        tax_rate_percent=tax.rate_percent if tax else None,
    )
    if amount is None:
        raise HTTPException(status_code=400, detail="Unable to calculate booking amount")
    return amount


def cancellation_deadline_for_request(db: Session, req: BookingRequest, space: Space) -> datetime:
    location = db.query(Location).filter(Location.id == space.location_id).first()
    policy = None
    if location:
        policy = (
            db.query(CancellationPolicy)
            .filter(
                CancellationPolicy.tenant_id == location.organization_id,
                CancellationPolicy.space_type == space.space_type,
            )
            .first()
        )
    hours = policy.cancel_window_hours if policy else 0
    start = req.start_datetime
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start - timedelta(hours=hours)


def _apply_commission(db: Session, payment: Payment) -> None:
    if payment.tenant_id is None or payment.status != PaymentStatus.SUCCEEDED:
        return
    organization = db.query(Organization).filter(Organization.id == payment.tenant_id).first()
    commission_pct = get_effective_commission_pct(db, organization)
    platform_fee, owner_net = calculate_commission_snapshot(payment.amount or 0, commission_pct)
    payment.commission_rate_pct = commission_pct
    payment.platform_fee_amount = platform_fee
    payment.owner_net_amount = owner_net


def _create_invoice(db: Session, *, req: BookingRequest, booking: Booking, payment: Payment) -> None:
    invoice = db.query(Invoice).filter(Invoice.payment_id == payment.id).first()
    if invoice:
        invoice.booking_id = booking.id
        invoice.amount = payment.amount
        invoice.status = "issued"
    else:
        invoice = Invoice(
            tenant_id=booking.tenant_id,
            user_id=booking.user_id,
            booking_id=booking.id,
            payment_id=payment.id,
            amount=payment.amount,
            status="issued",
        )
    invoice.commission_rate_pct = payment.commission_rate_pct
    invoice.platform_fee_amount = payment.platform_fee_amount
    invoice.owner_net_amount = payment.owner_net_amount
    db.add(invoice)


def charge_booking_request(
    db: Session,
    req: BookingRequest,
    *,
    operator_notes: str | None = None,
) -> tuple[BookingRequest, Booking | None, Payment | None]:
    existing_success = (
        db.query(Payment)
        .filter(
            Payment.booking_request_id == req.id,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .order_by(Payment.created_at.desc())
        .first()
    )
    if existing_success and req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        return req, booking, existing_success

    if req.status not in (BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED):
        raise HTTPException(status_code=400, detail="Request already processed")

    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    setting = (
        db.query(OwnerPaymentSetting)
        .filter(OwnerPaymentSetting.id == req.owner_payment_setting_id)
        .first()
    )
    method = (
        db.query(CustomerOwnerPaymentMethod)
        .filter(CustomerOwnerPaymentMethod.id == req.customer_owner_payment_method_id)
        .first()
    )
    if not setting or not method or method.status != "active":
        req.status = BookingRequestStatus.PAYMENT_FAILED
        req.payment_status = "failed"
        req.operator_notes = operator_notes
        db.add(req)
        db.commit()
        db.refresh(req)
        return req, None, None

    amount = estimate_request_amount(db, req, space)
    amount_cents = amount * 100
    attempt = (req.payment_attempt_count or 0) + 1
    idempotency_key = f"booking_{req.public_id}_attempt_{attempt}"
    payment = db.query(Payment).filter(Payment.idempotency_key == idempotency_key).first()
    if not payment:
        payment = Payment(
            user_id=req.user_id,
            booking_request_id=req.id,
            tenant_id=req.tenant_id,
            amount=amount,
            amount_cents=amount_cents,
            currency="usd",
            provider=setting.provider,
            payment_method_id=method.id,
            status=PaymentStatus.REQUIRES_PAYMENT,
            attempt_number=attempt,
            idempotency_key=idempotency_key,
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)

    failure_reason = "Payment provider did not return a result"
    try:
        provider = PaymentProviderFactory.get(setting)
        result = provider.charge_saved_method(
            payment_method=method,
            amount_cents=amount_cents,
            currency="usd",
            idempotency_key=idempotency_key,
            metadata={"booking_request_public_id": req.public_id},
        )
    except PaymentProviderError as exc:
        result = None
        failure_reason = str(exc)
    except Exception as exc:
        result = None
        failure_reason = str(exc)

    req.payment_attempt_count = attempt
    req.operator_notes = operator_notes
    if result and result.status == "succeeded":
        payment.status = PaymentStatus.SUCCEEDED
        payment.provider_payment_id = result.provider_payment_id
        payment.provider_reference_id = result.provider_reference_id
        payment.raw_response = result.raw_response
        if setting.provider == "stripe":
            payment.stripe_payment_intent_id = result.provider_payment_id
        _apply_commission(db, payment)

        booking = Booking(
            user_id=req.user_id,
            space_id=req.space_id,
            tenant_id=req.tenant_id,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            status=BookingStatus.CONFIRMED,
            stripe_payment_intent_id=payment.stripe_payment_intent_id,
        )
        db.add(booking)
        db.flush()
        payment.booking_id = booking.id
        req.booking_id = booking.id
        req.status = BookingRequestStatus.APPROVED
        req.payment_status = "succeeded"
        req.approved_at = datetime.now(timezone.utc)
        _create_invoice(db, req=req, booking=booking, payment=payment)
        db.add(payment)
        db.add(req)
        db.commit()
        db.refresh(req)
        db.refresh(booking)
        db.refresh(payment)
        customer = db.query(User).filter(User.id == req.user_id).first()
        if customer:
            send_email(customer.email, "Booking approved and charged", f"Request {req.public_id} was approved and charged.")
        return req, booking, payment

    failure_reason = result.failure_reason if result else failure_reason
    payment.status = PaymentStatus.FAILED
    payment.failure_reason = failure_reason
    payment.raw_response = result.raw_response if result else {"error": failure_reason}
    if result:
        payment.provider_payment_id = result.provider_payment_id
        payment.provider_reference_id = result.provider_reference_id
    req.status = BookingRequestStatus.PAYMENT_FAILED
    req.payment_status = "failed"
    db.add(payment)
    db.add(req)
    db.commit()
    db.refresh(req)
    db.refresh(payment)
    customer = db.query(User).filter(User.id == req.user_id).first()
    if customer:
        send_email(customer.email, "Booking payment failed", f"Request {req.public_id} could not be charged.")
    return req, None, payment


def refund_booking_payment(db: Session, *, req: BookingRequest | None, booking: Booking, amount_cents: int | None = None) -> Payment | None:
    query = db.query(Payment).filter(Payment.status == PaymentStatus.SUCCEEDED)
    if req:
        query = query.filter(Payment.booking_request_id == req.id)
    else:
        query = query.filter(Payment.booking_id == booking.id)
    payment = query.order_by(Payment.created_at.desc()).first()
    if not payment:
        return None
    setting = None
    if req and req.owner_payment_setting_id:
        setting = db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.id == req.owner_payment_setting_id).first()
    if not setting:
        setting = (
            db.query(OwnerPaymentSetting)
            .filter(OwnerPaymentSetting.organization_id == booking.tenant_id, OwnerPaymentSetting.provider == payment.provider)
            .first()
        )
    if not setting:
        raise HTTPException(status_code=400, detail="Payment setting not found for refund")
    provider = PaymentProviderFactory.get(setting)
    result = provider.void_or_refund(
        provider_payment_id=payment.provider_payment_id or payment.stripe_payment_intent_id,
        provider_reference_id=payment.provider_reference_id,
        amount_cents=amount_cents,
    )
    if result.status == "voided":
        payment.status = PaymentStatus.VOIDED
    elif result.status == "refunded":
        payment.status = PaymentStatus.REFUNDED
    else:
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = result.failure_reason or "Refund failed"
    payment.raw_response = result.raw_response
    payment.provider_reference_id = result.provider_reference_id or payment.provider_reference_id
    db.add(payment)
    return payment
