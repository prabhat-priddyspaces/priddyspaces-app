from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_series import BookingSeries
from app.models.booking_request import BookingRequest
from app.models.cancellation_policy import CancellationPolicy
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import BookingRequestStatus, BookingStatus, PaymentStatus, UserRole
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.payment_refund import PaymentRefund
from app.models.pricing_rule import PricingRule
from app.models.space import Space
from app.models.tax_config import TaxConfig
from app.models.user import User
from app.services.owner_payments import ensure_payment_method_chargeable
from app.services.payment_metadata import normalize_payment_failure_reason
from app.services.payment_providers import PaymentProviderError, PaymentProviderFactory
from app.services.notifications import (
    send_booking_cancelled_email,
    send_booking_request_cancelled_email,
    send_owner_booking_cancelled_notification,
)
from app.services.platform_auth import calculate_commission_snapshot, get_effective_commission_pct
from app.services.pricing import EstimateResult, VolumeDiscount, estimate_booking_price
from app.services.cancellation_refunds import policy_for_space, policy_snapshot, refund_percent_from_snapshot
from app.services.loyalty import (
    discount_cents_for_request,
    finalize_redemption_for_payment,
    record_earned_for_payment,
    release_redemption_for_request,
    reverse_for_payment_refund,
)

logger = logging.getLogger(__name__)

DEFAULT_PAYMENT_FAILURE_HOLD_MINUTES = 30


def _payment_failure_hold_minutes(db: Session, req: BookingRequest) -> int:
    organization = db.query(Organization).filter(Organization.id == req.tenant_id).first()
    if organization is None or organization.payment_failure_hold_minutes is None:
        return DEFAULT_PAYMENT_FAILURE_HOLD_MINUTES
    return max(0, int(organization.payment_failure_hold_minutes))


def cancel_payment_hold_for_request(
    db: Session,
    req: BookingRequest,
    *,
    reason: str = "expired",
    now: datetime | None = None,
) -> Booking | None:
    now = now or datetime.now(timezone.utc)
    booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    if booking and booking.status != BookingStatus.CANCELED:
        booking.status = BookingStatus.CANCELED
        db.add(booking)
    if req.booking_series_id:
        db.query(Booking).filter(
            Booking.booking_series_id == req.booking_series_id,
            Booking.status == BookingStatus.PENDING,
        ).update({Booking.status: BookingStatus.CANCELED}, synchronize_session=False)
        series = db.query(BookingSeries).filter(BookingSeries.id == req.booking_series_id).first()
        if series and series.status != "cancelled":
            series.status = "cancelled"
            db.add(series)
    release_redemption_for_request(db, req, reason="released")
    req.status = BookingRequestStatus.CANCELLED
    req.payment_status = req.payment_status or "failed"
    req.payment_hold_expires_at = req.payment_hold_expires_at or now
    req.cancelled_at = now
    req.operator_notes = req.operator_notes or reason
    db.add(req)
    return booking


def _owner_recipients_for_space(db: Session, space: Space) -> list[tuple[str, str, int]]:
    roles = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}
    members = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == space.tenant_id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.receives_new_booking_email.is_(True),
            OrganizationMember.role.in_(roles),
        )
        .all()
    )
    user_ids = {member.user_id for member in members}
    users = {user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    seen: set[str] = set()
    recipients: list[tuple[str, str, int]] = []
    for member in members:
        user = users.get(member.user_id)
        if not user or not user.email or user.email in seen:
            continue
        seen.add(user.email)
        recipients.append((user.email, member.role.value, user.id))
    return recipients


def expire_payment_holds(db: Session, *, limit: int = 100) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    requests = (
        db.query(BookingRequest)
        .filter(
            BookingRequest.status == BookingRequestStatus.PAYMENT_FAILED,
            BookingRequest.payment_hold_expires_at.isnot(None),
            BookingRequest.payment_hold_expires_at <= now,
        )
        .order_by(BookingRequest.payment_hold_expires_at.asc())
        .limit(limit)
        .all()
    )
    expired = 0
    emails_attempted = 0
    for req in requests:
        space = db.query(Space).filter(Space.id == req.space_id).first()
        location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
        booking = cancel_payment_hold_for_request(db, req, reason="payment_hold_expired", now=now)
        db.commit()
        db.refresh(req)
        if booking:
            db.refresh(booking)
        expired += 1
        if not space or not location:
            continue
        try:
            if booking:
                send_booking_cancelled_email(db, booking, req, space, location)
            else:
                send_booking_request_cancelled_email(db, req, space, location)
            emails_attempted += 1
        except Exception:  # noqa: BLE001
            logger.exception("Failed to send member hold-expiry email request_public_id=%s", req.public_id)
        for owner_email, role, user_id in _owner_recipients_for_space(db, space):
            try:
                send_owner_booking_cancelled_notification(
                    db,
                    owner_email,
                    req,
                    space,
                    location,
                    booking=booking,
                    reason="Payment recovery window expired",
                    recipient_role=role,
                    recipient_user_id=user_id,
                )
                emails_attempted += 1
            except Exception:  # noqa: BLE001
                logger.exception("Failed to send owner hold-expiry email request_public_id=%s", req.public_id)
    return {"expired_payment_holds": expired, "emails_attempted": emails_attempted}


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
    return _estimate_request_snapshot(db, req, space)["total_cents"]


def _granularity_to_minutes(value) -> int:
    raw = getattr(value, "value", value)
    return {"30m": 30, "60m": 60, "120m": 120, "daily": 24 * 60}.get(raw, 60)


def _active_volume_discounts(db: Session, space_id: int) -> list[VolumeDiscount]:
    try:
        from app.models.space_volume_discount import SpaceVolumeDiscount
    except ImportError:
        return []
    rows = (
        db.query(SpaceVolumeDiscount)
        .filter(
            SpaceVolumeDiscount.space_id == space_id,
            SpaceVolumeDiscount.is_active.is_(True),
        )
        .all()
    )
    return [VolumeDiscount(min_hours=float(r.min_hours), discount_percent=int(r.discount_percent)) for r in rows]


def _snapshot_from_estimate(
    estimate: EstimateResult,
    *,
    occurrence_count: int,
    refund_snapshot: dict,
    quantity: int = 1,
) -> dict:
    multiplier = max(1, occurrence_count) * max(1, quantity)
    return {
        "base_cents": estimate.base_cents * multiplier,
        "discount_cents": estimate.discount_cents * multiplier,
        "tax_cents": estimate.tax_cents * multiplier,
        "total_cents": estimate.total_cents * multiplier,
        "rate_basis": estimate.rate_basis,
        "units": estimate.units,
        "occurrence_count": max(1, occurrence_count),
        "quantity": max(1, quantity),
        "refund_policy": refund_snapshot,
    }


def _estimate_request_snapshot(db: Session, req: BookingRequest, space: Space) -> dict:
    if req.pricing_snapshot:
        try:
            parsed = json.loads(req.pricing_snapshot)
            if isinstance(parsed, dict) and parsed.get("total_cents") is not None:
                return parsed
        except json.JSONDecodeError:
            pass

    rule = get_active_pricing_rule(db, space.id)
    tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first()
    granularity_minutes = _granularity_to_minutes(location.booking_granularity) if location else 60
    request_kind = getattr(req.request_kind, "value", req.request_kind)
    is_day_pass = request_kind == "daily_booking"
    booking_mode = "day_pass" if is_day_pass else ("hourly" if req.instant_booking else None)
    estimate = estimate_booking_price(
        req.start_datetime,
        req.end_datetime,
        price_hourly=space.price_hourly,
        price_daily=space.price_daily,
        price_monthly=space.price_monthly,
        rate_type=rule.rate_type if rule else None,
        rate_amount=rule.rate_amount if rule else None,
        booking_mode=booking_mode,
        full_day=is_day_pass,
        volume_discounts=_active_volume_discounts(db, space.id),
        granularity_minutes=granularity_minutes,
        tax_rate_percent=tax.rate_percent if tax else None,
    )
    if estimate is None:
        raise HTTPException(status_code=400, detail="Unable to calculate booking amount")
    refund_snapshot = {}
    if location:
        refund_snapshot = policy_snapshot(db, policy_for_space(db, location, space))
    occurrence_count = max(1, req.occurrence_count or 1)
    quantity = (
        max(1, req.seats_requested or 1)
        if is_day_pass and getattr(space.space_type, "value", space.space_type) == "shared_desk"
        else 1
    )
    return _snapshot_from_estimate(
        estimate,
        occurrence_count=occurrence_count,
        refund_snapshot=refund_snapshot,
        quantity=quantity,
    )


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


def _sanitized_failure_reason(reason: str | None) -> str:
    return normalize_payment_failure_reason(reason)


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

    snapshot = _estimate_request_snapshot(db, req, space)
    gross_amount_cents = int(snapshot["total_cents"])
    loyalty_discount_cents = discount_cents_for_request(db, req)
    amount_cents = max(0, gross_amount_cents - loyalty_discount_cents)
    payment_snapshot = {
        **snapshot,
        "total_before_loyalty_cents": gross_amount_cents,
        "loyalty_discount_cents": loyalty_discount_cents,
        "total_cents": amount_cents,
    }
    setting = None
    method = None
    if amount_cents > 0:
        setting = (
            db.query(OwnerPaymentSetting)
            .filter(OwnerPaymentSetting.id == req.owner_payment_setting_id)
            .first()
        )
        method = (
            db.query(MemberOwnerPaymentMethod)
            .filter(MemberOwnerPaymentMethod.id == req.member_owner_payment_method_id)
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
    amount = amount_cents // 100
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
            subtotal_cents=payment_snapshot.get("base_cents"),
            discount_cents=(payment_snapshot.get("discount_cents") or 0) + loyalty_discount_cents,
            tax_cents=payment_snapshot.get("tax_cents"),
            currency="usd",
            provider=setting.provider if setting else "points",
            payment_method_id=method.id if method else None,
            status=PaymentStatus.REQUIRES_PAYMENT if amount_cents > 0 else PaymentStatus.SUCCEEDED,
            attempt_number=attempt,
            idempotency_key=idempotency_key,
            booking_series_id=req.booking_series_id,
            pricing_snapshot=payment_snapshot,
            refund_policy_snapshot=payment_snapshot.get("refund_policy"),
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)

    if amount_cents == 0:
        payment.status = PaymentStatus.SUCCEEDED
        payment.raw_response = {"covered_by_points": True}
        req.payment_attempt_count = attempt
        req.operator_notes = operator_notes
        if req.booking_id:
            booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
            if not booking:
                raise HTTPException(status_code=409, detail="Booking hold no longer exists")
            booking.status = BookingStatus.CONFIRMED
            db.add(booking)
        else:
            booking = Booking(
                user_id=req.user_id,
                space_id=req.space_id,
                tenant_id=req.tenant_id,
                start_datetime=req.start_datetime,
                end_datetime=req.end_datetime,
                inventory_start_datetime=req.start_datetime - timedelta(minutes=space.buffer_before_minutes or 0),
                inventory_end_datetime=req.end_datetime + timedelta(minutes=space.buffer_after_minutes or 0),
                booking_request_id=req.id,
                booking_series_id=req.booking_series_id,
                status=BookingStatus.CONFIRMED,
            )
            db.add(booking)
            db.flush()
            req.booking_id = booking.id
        if req.booking_series_id:
            db.query(Booking).filter(
                Booking.booking_series_id == req.booking_series_id,
                Booking.status == BookingStatus.PENDING,
            ).update({Booking.status: BookingStatus.CONFIRMED}, synchronize_session=False)
        payment.booking_id = booking.id
        req.status = BookingRequestStatus.APPROVED
        req.payment_status = "succeeded"
        req.payment_hold_expires_at = None
        req.approved_at = datetime.now(timezone.utc)
        req.pricing_snapshot = json.dumps(payment_snapshot)
        req.refund_policy_snapshot = json.dumps(payment_snapshot.get("refund_policy") or {})
        _create_invoice(db, req=req, booking=booking, payment=payment)
        db.add(payment)
        db.add(req)
        db.commit()
        db.refresh(req)
        db.refresh(booking)
        db.refresh(payment)
        finalize_redemption_for_payment(db, req, booking, payment)
        db.commit()
        return req, booking, payment

    failure_reason = "Payment provider did not return a result"
    if not ensure_payment_method_chargeable(db, method, setting):
        result = None
        failure_reason = "Card details are incomplete. Please add the card again."
    else:
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

        if req.booking_id:
            booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
            if not booking:
                raise HTTPException(status_code=409, detail="Booking hold no longer exists")
            booking.status = BookingStatus.CONFIRMED
            booking.stripe_payment_intent_id = payment.stripe_payment_intent_id
            db.add(booking)
        else:
            booking = Booking(
                user_id=req.user_id,
                space_id=req.space_id,
                tenant_id=req.tenant_id,
                start_datetime=req.start_datetime,
                end_datetime=req.end_datetime,
                inventory_start_datetime=req.start_datetime - timedelta(minutes=space.buffer_before_minutes or 0),
                inventory_end_datetime=req.end_datetime + timedelta(minutes=space.buffer_after_minutes or 0),
                booking_request_id=req.id,
                booking_series_id=req.booking_series_id,
                status=BookingStatus.CONFIRMED,
                stripe_payment_intent_id=payment.stripe_payment_intent_id,
            )
            db.add(booking)
            db.flush()
            req.booking_id = booking.id
        if req.booking_series_id:
            db.query(Booking).filter(
                Booking.booking_series_id == req.booking_series_id,
                Booking.status == BookingStatus.PENDING,
            ).update(
                {
                    Booking.status: BookingStatus.CONFIRMED,
                    Booking.stripe_payment_intent_id: payment.stripe_payment_intent_id,
                },
                synchronize_session=False,
            )
        payment.booking_id = booking.id
        req.status = BookingRequestStatus.APPROVED
        req.payment_status = "succeeded"
        req.payment_hold_expires_at = None
        req.approved_at = datetime.now(timezone.utc)
        req.pricing_snapshot = json.dumps(payment_snapshot)
        req.refund_policy_snapshot = json.dumps(payment_snapshot.get("refund_policy") or {})
        _create_invoice(db, req=req, booking=booking, payment=payment)
        db.add(payment)
        db.add(req)
        db.commit()
        db.refresh(req)
        db.refresh(booking)
        db.refresh(payment)
        finalize_redemption_for_payment(db, req, booking, payment)
        db.commit()
        record_earned_for_payment(db, payment, booking=booking, booking_request=req)
        return req, booking, payment

    failure_reason = _sanitized_failure_reason(result.failure_reason if result else failure_reason)
    payment.status = PaymentStatus.FAILED
    payment.failure_reason = failure_reason
    payment.raw_response = result.raw_response if result else {"error": failure_reason}
    if result:
        payment.provider_payment_id = result.provider_payment_id
        payment.provider_reference_id = result.provider_reference_id
    now = datetime.now(timezone.utc)
    hold_minutes = _payment_failure_hold_minutes(db, req)
    booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    keep_hold = bool(hold_minutes > 0 and booking and booking.status != BookingStatus.CANCELED)
    req.payment_failed_at = now
    req.payment_status = "failed"
    if keep_hold:
        req.status = BookingRequestStatus.PAYMENT_FAILED
        req.payment_hold_expires_at = now + timedelta(minutes=hold_minutes)
    else:
        if hold_minutes == 0:
            cancel_payment_hold_for_request(db, req, reason="payment_failed_cancel_immediately", now=now)
        else:
            req.status = BookingRequestStatus.PAYMENT_FAILED
            req.payment_hold_expires_at = None
            if booking:
                booking.status = BookingStatus.CANCELED
                db.add(booking)
            if req.booking_series_id:
                db.query(Booking).filter(
                    Booking.booking_series_id == req.booking_series_id,
                    Booking.status == BookingStatus.PENDING,
                ).update({Booking.status: BookingStatus.CANCELED}, synchronize_session=False)
            release_redemption_for_request(db, req, reason="released")
    logger.warning(
        "booking_payment_failed request_public_id=%s payment_public_id=%s provider=%s attempt=%s payment_method_public_id=%s hold_minutes=%s hold_expires_at=%s final_status=%s failure_reason=%s",
        req.public_id,
        payment.public_id,
        setting.provider if setting else None,
        attempt,
        method.public_id if method else None,
        hold_minutes,
        req.payment_hold_expires_at.isoformat() if req.payment_hold_expires_at else None,
        getattr(req.status, "value", req.status),
        failure_reason,
    )
    db.add(payment)
    db.add(req)
    db.commit()
    db.refresh(req)
    db.refresh(payment)
    return req, booking if keep_hold else None, payment


def _refund_snapshot(req: BookingRequest | None, payment: Payment | None) -> dict:
    if req and req.refund_policy_snapshot:
        try:
            return json.loads(req.refund_policy_snapshot)
        except json.JSONDecodeError:
            return {}
    if payment and payment.refund_policy_snapshot:
        return payment.refund_policy_snapshot
    return {}


def refund_booking_payment(db: Session, *, req: BookingRequest | None, booking: Booking, amount_cents: int | None = None) -> Payment | None:
    query = db.query(Payment).filter(Payment.status.in_([PaymentStatus.SUCCEEDED, PaymentStatus.PARTIALLY_REFUNDED]))
    if req:
        query = query.filter(Payment.booking_request_id == req.id)
    else:
        query = query.filter(Payment.booking_id == booking.id)
    payment = query.order_by(Payment.created_at.desc()).first()
    if not payment:
        return None
    refund_percent = refund_percent_from_snapshot(
        _refund_snapshot(req, payment),
        start_datetime=booking.start_datetime,
    )
    remaining_cents = max(0, (payment.amount_cents or payment.amount * 100) - (payment.refunded_amount_cents or 0))
    if amount_cents is None:
        amount_cents = int(round(remaining_cents * (refund_percent / 100.0)))
    else:
        amount_cents = min(amount_cents, remaining_cents)
    if amount_cents <= 0:
        payment.refunded_amount_cents = payment.refunded_amount_cents or 0
        if (payment.amount_cents or payment.amount * 100) <= 0 and payment.status == PaymentStatus.SUCCEEDED:
            payment.status = PaymentStatus.REFUNDED
            reverse_for_payment_refund(db, payment)
        db.add(payment)
        return payment
    idempotency_key = f"refund_{payment.public_id}_{booking.public_id}_{amount_cents}"
    existing_refund = db.query(PaymentRefund).filter(PaymentRefund.idempotency_key == idempotency_key).first()
    if existing_refund and existing_refund.status in {"refunded", "voided"}:
        return payment
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
    refund = existing_refund or PaymentRefund(
        tenant_id=payment.tenant_id or booking.tenant_id,
        payment_id=payment.id,
        booking_id=booking.id,
        booking_request_id=req.id if req else None,
        amount_cents=amount_cents,
        refund_percent=refund_percent,
        provider=payment.provider or setting.provider,
        idempotency_key=idempotency_key,
    )
    refund.raw_response = result.raw_response
    refund.provider_refund_id = result.provider_payment_id
    refund.provider_reference_id = result.provider_reference_id
    refund.status = result.status
    refund.failure_reason = result.failure_reason
    db.add(refund)
    if result.status in {"voided", "refunded"}:
        payment.refunded_amount_cents = (payment.refunded_amount_cents or 0) + amount_cents
        total_cents = payment.amount_cents or payment.amount * 100
        if result.status == "voided" and payment.refunded_amount_cents >= total_cents:
            payment.status = PaymentStatus.VOIDED
        elif payment.refunded_amount_cents >= total_cents:
            payment.status = PaymentStatus.REFUNDED
        else:
            payment.status = PaymentStatus.PARTIALLY_REFUNDED
    else:
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = result.failure_reason or "Refund failed"
    payment.raw_response = result.raw_response
    payment.provider_reference_id = result.provider_reference_id or payment.provider_reference_id
    db.add(payment)
    if payment.status in {PaymentStatus.REFUNDED, PaymentStatus.VOIDED}:
        reverse_for_payment_refund(db, payment)
    return payment
