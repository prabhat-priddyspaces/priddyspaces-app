from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import stripe
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.models.booking import Booking
from app.models.booking_payment_link import BookingPaymentLink
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestKind, BookingRequestStatus, BookingStatus, PaymentStatus, SpaceType, UserAppRole, UserRole
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.org_member_profile import OrgMemberProfile
from app.models.organization import Organization
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.space import Space
from app.models.tax_config import TaxConfig
from app.models.user import User
from app.schemas.owner_booking import OwnerBookingCreate, OwnerBookingPreviewCreate
from app.services.access_passes import ensure_access_passes_for_booking_request
from app.services.audit import write_audit_log
from app.services.authz import get_org_member, require_pricing_override
from app.services.booking_inventory import as_utc, create_pending_booking_hold, expand_occurrences, validate_occurrences_available
from app.services.booking_payments import (
    DEFAULT_PAYMENT_FAILURE_HOLD_MINUTES,
    finalize_successful_booking_request_payment,
    get_active_pricing_rule,
)
from app.services.booking_products import validate_direct_booking_product
from app.services.cancellation_refunds import policy_for_space, policy_snapshot
from app.services.email_identity import get_user_by_normalized_email, normalize_email
from app.services.money import cents_to_money
from app.services.notifications import send_booking_confirmed_email, send_email
from app.services.owner_payments import get_enabled_owner_payment_setting, resolve_payment_provider
from app.services.payment_providers import PaymentProviderError, PaymentProviderFactory
from app.services.pricing import VolumeDiscount, estimate_booking_price

PAYMENT_LINK_STATUS_SENT = "sent"
PAYMENT_LINK_STATUS_PAID = "paid"
PAYMENT_LINK_STATUS_EXPIRED = "expired"
PAYMENT_LINK_STATUS_CANCELLED = "cancelled"


def payment_link_token_hash(token: str) -> str:
    key = (settings.JWT_SECRET or "priddyspaces-local-booking-payment-link-key").encode("utf-8")
    return hmac.new(key, token.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_payment_link_token() -> str:
    return secrets.token_urlsafe(32)


def payment_link_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/booking-payment/{token}"


def registration_url_for_request(req: BookingRequest, user: User) -> str | None:
    if user.email_verified or user.auth_subject or user.password_hash:
        return None
    query = urlencode({"email": user.email, "redirect_url": f"/member/requests/{req.public_id}"})
    return f"{settings.FRONTEND_URL.rstrip('/')}/sign-up?{query}"


def _frontend_url(path: str, query: dict[str, str] | None = None) -> str:
    qs = f"?{urlencode(query)}" if query else ""
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}{qs}"


def _split_name(full_name: str | None) -> tuple[str | None, str | None]:
    if not full_name:
        return None, None
    parts = full_name.strip().split(" ", 1)
    return parts[0] if parts else None, parts[1] if len(parts) > 1 else None


def _aware_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _display_name(user: User) -> str | None:
    return user.full_name or " ".join(part for part in [user.first_name, user.last_name] if part).strip() or None


def _active_volume_discounts(db: Session, space_id: int) -> list[VolumeDiscount]:
    try:
        from app.models.space_volume_discount import SpaceVolumeDiscount
    except ImportError:
        return []
    rows = (
        db.query(SpaceVolumeDiscount)
        .filter(SpaceVolumeDiscount.space_id == space_id, SpaceVolumeDiscount.is_active.is_(True))
        .all()
    )
    return [VolumeDiscount(min_hours=float(r.min_hours), discount_percent=int(r.discount_percent)) for r in rows]


def _granularity_to_minutes(value) -> int:
    raw = getattr(value, "value", value)
    return {"30m": 30, "60m": 60, "120m": 120, "daily": 24 * 60}.get(raw, 60)


def _space_type_value(space: Space) -> str:
    return getattr(space.space_type, "value", space.space_type)


def _request_kind(booking_mode: str, full_day: bool) -> str:
    return BookingRequestKind.DAILY_BOOKING.value if full_day or booking_mode == "day_pass" else BookingRequestKind.HOURLY_BOOKING.value


def _payment_hold_minutes(org: Organization | None) -> int:
    if org is None or org.payment_failure_hold_minutes is None:
        return DEFAULT_PAYMENT_FAILURE_HOLD_MINUTES
    return max(0, int(org.payment_failure_hold_minutes))


def amount_cents_for_request(req: BookingRequest) -> int:
    if req.pricing_snapshot:
        try:
            parsed = json.loads(req.pricing_snapshot)
            return int(parsed.get("total_cents") or parsed.get("total_amount_cents") or 0)
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return 0


def estimate_owner_booking_snapshot(
    db: Session,
    *,
    space: Space,
    location: Location,
    actor_member,
    payload: OwnerBookingPreviewCreate,
) -> dict:
    start_dt = as_utc(payload.start_datetime)
    end_dt = as_utc(payload.end_datetime)
    is_day_pass = payload.full_day or payload.booking_mode == "day_pass"
    tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
    rule = get_active_pricing_rule(db, space.id)
    estimate = estimate_booking_price(
        start_dt,
        end_dt,
        price_hourly=space.price_hourly,
        price_daily=space.price_daily,
        price_monthly=space.price_monthly,
        rate_type=rule.rate_type if rule else None,
        rate_amount=rule.rate_amount if rule else None,
        booking_mode="day_pass" if is_day_pass else "hourly",
        full_day=is_day_pass,
        volume_discounts=_active_volume_discounts(db, space.id),
        granularity_minutes=_granularity_to_minutes(location.booking_granularity) if location.booking_granularity else 60,
        tax_rate_percent=tax.rate_percent if tax else None,
    )
    if estimate is None:
        raise HTTPException(status_code=400, detail="Unable to calculate booking amount")

    quantity = (
        max(1, payload.seats_requested or 1)
        if is_day_pass and _space_type_value(space) == SpaceType.SHARED_DESK.value
        else 1
    )
    refund_snapshot = policy_snapshot(db, policy_for_space(db, location, space))
    base_snapshot = {
        "base_cents": estimate.base_cents * quantity,
        "discount_cents": estimate.discount_cents * quantity,
        "tax_cents": estimate.tax_cents * quantity,
        "total_cents": estimate.total_cents * quantity,
        "rate_basis": estimate.rate_basis,
        "units": estimate.units,
        "occurrence_count": 1,
        "quantity": quantity,
        "refund_policy": refund_snapshot,
    }
    if payload.override_amount_cents is None:
        return base_snapshot

    require_pricing_override(actor_member)
    reason = (payload.override_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Override reason is required")
    return {
        **base_snapshot,
        "original_total_cents": base_snapshot["total_cents"],
        "base_cents": int(payload.override_amount_cents),
        "discount_cents": 0,
        "tax_cents": 0,
        "total_cents": int(payload.override_amount_cents),
        "rate_basis": "owner_override",
        "units": None,
        "override_reason": reason,
    }


def resolve_owner_booking_member(db: Session, payload: OwnerBookingCreate, organization: Organization, actor_id: int) -> User:
    if payload.member_public_id:
        user = db.query(User).filter(User.public_id == payload.member_public_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Member not found")
    elif payload.member:
        email = normalize_email(str(payload.member.email))
        user = get_user_by_normalized_email(db, email)
        first_name, last_name = _split_name(payload.member.full_name)
        if not user:
            user = User(
                email=email,
                full_name=payload.member.full_name.strip(),
                first_name=first_name,
                last_name=last_name,
                phone=payload.member.phone,
                company_name=payload.member.company_name,
                role=UserAppRole.MEMBER,
                email_verified=False,
                is_active=True,
            )
            db.add(user)
            db.flush()
        else:
            if not user.role:
                user.role = UserAppRole.MEMBER
            if not user.full_name and payload.member.full_name:
                user.full_name = payload.member.full_name.strip()
            if not user.first_name and first_name:
                user.first_name = first_name
            if not user.last_name and last_name:
                user.last_name = last_name
            if not user.phone and payload.member.phone:
                user.phone = payload.member.phone
            if not user.company_name and payload.member.company_name:
                user.company_name = payload.member.company_name
            db.add(user)
    else:
        raise HTTPException(status_code=400, detail="Member is required")

    profile = (
        db.query(OrgMemberProfile)
        .filter(OrgMemberProfile.organization_id == organization.id, OrgMemberProfile.user_id == user.id)
        .first()
    )
    if not profile:
        profile = OrgMemberProfile(
            organization_id=organization.id,
            tenant_id=organization.id,
            user_id=user.id,
            status="active",
            created_by_user_id=actor_id,
        )
        db.add(profile)
    if payload.member:
        if payload.member.phone and not profile.phone:
            profile.phone = payload.member.phone
        if payload.member.company_name and not profile.company_name:
            profile.company_name = payload.member.company_name
    db.flush()
    return user


def create_booking_payment_link(
    db: Session,
    *,
    req: BookingRequest,
    actor_id: int,
    recipient_email: str,
    expires_at: datetime,
) -> tuple[BookingPaymentLink, str]:
    token = generate_payment_link_token()
    link = BookingPaymentLink(
        tenant_id=req.tenant_id,
        booking_request_id=req.id,
        created_by_user_id=actor_id,
        recipient_email=recipient_email,
        token_hash=payment_link_token_hash(token),
        status=PAYMENT_LINK_STATUS_SENT,
        expires_at=expires_at,
    )
    db.add(link)
    db.flush()
    return link, token


def latest_payment_link_for_request(db: Session, req: BookingRequest) -> BookingPaymentLink | None:
    return (
        db.query(BookingPaymentLink)
        .filter(BookingPaymentLink.booking_request_id == req.id)
        .order_by(BookingPaymentLink.created_at.desc(), BookingPaymentLink.id.desc())
        .first()
    )


def send_owner_created_booking_links(
    db: Session,
    *,
    req: BookingRequest,
    member: User,
    space: Space,
    location: Location,
    link: BookingPaymentLink | None = None,
    token: str | None = None,
) -> None:
    register_url = registration_url_for_request(req, member)
    lines = [
        f"Hi {_display_name(member) or member.email},",
        f"{location.name} created a booking for you.",
        f"Space: {space.name}",
        f"From: {req.start_datetime}",
        f"To: {req.end_datetime}",
    ]
    subject = "Your Priddyspaces booking"
    if link and token:
        lines.append(f"Complete payment: {payment_link_url(token)}")
    if register_url:
        lines.append(f"Create your account to manage this booking: {register_url}")
    else:
        lines.append(f"View your booking: {_frontend_url(f'/member/requests/{req.public_id}')}")
    try:
        send_email(member.email, subject, "\n".join(lines), db=db)
        if link:
            now = datetime.now(timezone.utc)
            link.sent_at = link.sent_at or now
            link.last_sent_at = now
            link.last_error = None
            db.add(link)
            db.flush()
    except Exception as exc:
        if link:
            link.last_error = str(exc)
            db.add(link)
            db.flush()
        raise


def create_owner_booking(
    db: Session,
    *,
    actor: User,
    actor_member,
    organization: Organization,
    location: Location,
    space: Space,
    payload: OwnerBookingCreate,
    audit_context: dict | None = None,
    acting_as_user_id: int | None = None,
) -> tuple[BookingRequest, Booking | None, Payment | None, BookingPaymentLink | None, str | None, User]:
    validate_direct_booking_product(
        space,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        seats_requested=payload.seats_requested,
    )
    occurrences = expand_occurrences(
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        location=location,
        space=space,
    )
    validate_occurrences_available(
        db,
        space=space,
        location=location,
        occurrences=occurrences,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        seats_requested=payload.seats_requested,
    )
    member = resolve_owner_booking_member(db, payload, organization, actor.id)
    snapshot = estimate_owner_booking_snapshot(
        db,
        space=space,
        location=location,
        actor_member=actor_member,
        payload=payload,
    )
    is_day_pass = payload.full_day or payload.booking_mode == "day_pass"
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=occurrences[0].start_datetime,
        end_datetime=occurrences[0].end_datetime,
        status=BookingRequestStatus.REQUESTED,
        request_kind=_request_kind(payload.booking_mode, payload.full_day),
        seats_requested=max(1, payload.seats_requested or 1),
        pricing_snapshot=json.dumps(snapshot),
        refund_policy_snapshot=json.dumps(snapshot.get("refund_policy") or {}),
        source="owner_created",
        created_by_user_id=actor.id,
        payment_collection_mode=payload.payment_collection_mode,
        payment_status="cash_collected" if payload.payment_collection_mode == "cash_collected" else "payment_link_sent",
        operator_notes=payload.operator_notes,
        instant_booking=False,
    )
    db.add(req)
    db.flush()

    payment: Payment | None = None
    link: BookingPaymentLink | None = None
    token: str | None = None
    booking = create_pending_booking_hold(
        db,
        user_id=member.id,
        space=space,
        occurrence=occurrences[0],
        booking_request_id=req.id,
    )
    req.booking_id = booking.id
    db.add(req)

    if payload.payment_collection_mode == "cash_collected":
        amount_cents = int(snapshot["total_cents"])
        payment = Payment(
            user_id=member.id,
            booking_request_id=req.id,
            booking_id=booking.id,
            tenant_id=space.tenant_id,
            amount=amount_cents // 100,
            amount_cents=amount_cents,
            subtotal_cents=snapshot.get("base_cents"),
            discount_cents=snapshot.get("discount_cents") or 0,
            tax_cents=snapshot.get("tax_cents") or 0,
            currency="usd",
            provider="cash",
            status=PaymentStatus.SUCCEEDED,
            attempt_number=1,
            idempotency_key=f"owner_cash_{req.public_id}",
            pricing_snapshot=snapshot,
            refund_policy_snapshot=snapshot.get("refund_policy"),
            raw_response={"cash_collected": True, "created_by_user_id": actor.id},
        )
        db.add(payment)
        db.flush()
        req.payment_attempt_count = 1
        req, booking, payment = finalize_successful_booking_request_payment(
            db,
            req=req,
            payment=payment,
            raw_response=payment.raw_response,
            payment_snapshot=snapshot,
        )
        send_booking_confirmed_email(db, req, booking, space, location, actor_user_id=actor.id)
        send_owner_created_booking_links(db, req=req, member=member, space=space, location=location)
    else:
        provider, _org, _loc = resolve_payment_provider(db, space)
        setting = get_enabled_owner_payment_setting(db, organization.id, provider)
        req.owner_payment_setting_id = setting.id
        req.payment_provider = provider
        hold_minutes = _payment_hold_minutes(organization)
        req.payment_hold_expires_at = datetime.now(timezone.utc) + timedelta(minutes=hold_minutes)
        link, token = create_booking_payment_link(
            db,
            req=req,
            actor_id=actor.id,
            recipient_email=member.email,
            expires_at=req.payment_hold_expires_at,
        )
        db.add(req)
        send_owner_created_booking_links(db, req=req, member=member, space=space, location=location, link=link, token=token)
        db.commit()
        db.refresh(req)
        db.refresh(booking)
        db.refresh(link)

    if payload.payment_collection_mode == "cash_collected":
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        payment = db.query(Payment).filter(Payment.booking_request_id == req.id).order_by(Payment.created_at.desc()).first()
        link = None
    write_audit_log(
        db=db,
        actor_id=actor.id,
        action="owner_booking_created",
        entity_type="booking_request",
        entity_public_id=req.public_id,
        before_state=None,
        after_state={
            "status": getattr(req.status, "value", req.status),
            "payment_status": req.payment_status,
            "payment_collection_mode": req.payment_collection_mode,
            "amount_cents": snapshot["total_cents"],
            "override_reason": snapshot.get("override_reason"),
        },
        acting_as_user_id=acting_as_user_id,
        context=audit_context,
    )
    db.commit()
    return req, booking, payment, link, token, member


def resolve_payment_link(db: Session, token: str, *, mutate_expired: bool = True) -> tuple[BookingPaymentLink, BookingRequest, User, Space, Location, Organization, OwnerPaymentSetting]:
    link = db.query(BookingPaymentLink).filter(BookingPaymentLink.token_hash == payment_link_token_hash(token)).first()
    if not link:
        raise HTTPException(status_code=404, detail="Payment link not found")
    req = db.query(BookingRequest).filter(BookingRequest.id == link.booking_request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Payment link not found")
    member = db.query(User).filter(User.id == req.user_id).first()
    space = db.query(Space).filter(Space.id == req.space_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
    organization = db.query(Organization).filter(Organization.id == req.tenant_id).first()
    if not member or not space or not location or not organization:
        raise HTTPException(status_code=404, detail="Payment link not found")
    now = datetime.now(timezone.utc)
    if mutate_expired and link.status == PAYMENT_LINK_STATUS_SENT and _aware_utc(link.expires_at) <= now:
        expire_owner_payment_link(db, link=link, req=req)
        db.commit()
        db.refresh(link)
        db.refresh(req)
    if link.status != PAYMENT_LINK_STATUS_SENT:
        raise HTTPException(status_code=400, detail=f"Payment link is {link.status}")
    if req.status != BookingRequestStatus.REQUESTED:
        raise HTTPException(status_code=400, detail="Booking request is no longer payable")
    if not req.owner_payment_setting_id:
        raise HTTPException(status_code=400, detail="Payment provider is not configured")
    setting = db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.id == req.owner_payment_setting_id).first()
    if not setting or not setting.is_enabled:
        raise HTTPException(status_code=400, detail="Payment provider is not available")
    return link, req, member, space, location, organization, setting


def expire_owner_payment_link(db: Session, *, link: BookingPaymentLink, req: BookingRequest) -> None:
    booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    if booking and booking.status != BookingStatus.CANCELED:
        booking.status = BookingStatus.CANCELED
        db.add(booking)
    req.status = BookingRequestStatus.CANCELLED
    req.payment_status = "expired"
    req.cancelled_at = datetime.now(timezone.utc)
    link.status = PAYMENT_LINK_STATUS_EXPIRED
    db.add(req)
    db.add(link)


def mark_payment_links_paid(db: Session, req: BookingRequest) -> None:
    db.query(BookingPaymentLink).filter(
        BookingPaymentLink.booking_request_id == req.id,
        BookingPaymentLink.status == PAYMENT_LINK_STATUS_SENT,
    ).update({"status": PAYMENT_LINK_STATUS_PAID}, synchronize_session=False)


def create_stripe_intent_for_link(db: Session, token: str) -> tuple[str, str, str]:
    link, req, _member, _space, _location, _org, setting = resolve_payment_link(db, token)
    if setting.provider != "stripe":
        raise HTTPException(status_code=400, detail="This payment link is not configured for Stripe")
    secret_key = decrypt_secret(setting.stripe_secret_key_encrypted)
    if not secret_key or not setting.stripe_publishable_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured")
    amount_cents = amount_cents_for_request(req)
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Booking amount is not payable")
    intent = stripe.PaymentIntent.create(
        amount=amount_cents,
        currency="usd",
        metadata={"booking_request_public_id": req.public_id, "booking_payment_link_public_id": link.public_id},
        api_key=secret_key,
        idempotency_key=f"booking_link_{link.public_id}_{req.payment_attempt_count or 0}",
    )
    payment = Payment(
        user_id=req.user_id,
        booking_request_id=req.id,
        booking_id=req.booking_id,
        tenant_id=req.tenant_id,
        amount=amount_cents // 100,
        amount_cents=amount_cents,
        currency="usd",
        provider="stripe",
        owner_net_amount=None,
        status=PaymentStatus.REQUIRES_PAYMENT,
        attempt_number=(req.payment_attempt_count or 0) + 1,
        idempotency_key=f"booking_link_{link.public_id}_{req.payment_attempt_count or 0}",
        stripe_payment_intent_id=intent.id,
        provider_payment_id=intent.id,
        pricing_snapshot=json.loads(req.pricing_snapshot) if req.pricing_snapshot else None,
    )
    req.payment_attempt_count = payment.attempt_number
    db.add(payment)
    db.add(req)
    db.commit()
    return intent.client_secret, intent.id, setting.stripe_publishable_key


def charge_cardpointe_link(db: Session, token: str, payload: dict) -> tuple[BookingRequest, Booking, Payment]:
    link, req, member, space, location, _org, setting = resolve_payment_link(db, token)
    if setting.provider != "cardpointe":
        raise HTTPException(status_code=400, detail="This payment link is not configured for CardPointe")
    amount_cents = amount_cents_for_request(req)
    if amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Booking amount is not payable")
    provider = PaymentProviderFactory.get(setting)
    try:
        saved = provider.save_payment_method(payload)
        method = MemberOwnerPaymentMethod(
            user_id=member.id,
            organization_id=req.tenant_id,
            tenant_id=req.tenant_id,
            provider="cardpointe",
            owner_payment_setting_id=setting.id,
            card_token=saved.card_token,
            last4=saved.last4,
            brand=saved.brand,
            exp_month=saved.exp_month,
            exp_year=saved.exp_year,
            status="active",
        )
        result = provider.charge_saved_method(
            payment_method=method,
            amount_cents=amount_cents,
            currency="usd",
            idempotency_key=f"booking_link_{link.public_id}_{req.payment_attempt_count + 1}",
            metadata={"booking_request_public_id": req.public_id},
        )
    except PaymentProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    attempt = (req.payment_attempt_count or 0) + 1
    payment = Payment(
        user_id=req.user_id,
        booking_request_id=req.id,
        booking_id=req.booking_id,
        tenant_id=req.tenant_id,
        amount=amount_cents // 100,
        amount_cents=amount_cents,
        currency="usd",
        provider="cardpointe",
        status=PaymentStatus.SUCCEEDED if result.status == "succeeded" else PaymentStatus.FAILED,
        attempt_number=attempt,
        idempotency_key=f"booking_link_{link.public_id}_{attempt}",
        provider_payment_id=result.provider_payment_id,
        provider_reference_id=result.provider_reference_id,
        raw_response=result.raw_response,
        failure_reason=result.failure_reason,
        pricing_snapshot=json.loads(req.pricing_snapshot) if req.pricing_snapshot else None,
    )
    req.payment_attempt_count = attempt
    db.add(payment)
    db.add(req)
    db.flush()
    if result.status != "succeeded":
        db.commit()
        raise HTTPException(status_code=400, detail=result.failure_reason or "Payment failed")
    req, booking, payment = finalize_successful_booking_request_payment(
        db,
        req=req,
        payment=payment,
        provider_payment_id=result.provider_payment_id,
        provider_reference_id=result.provider_reference_id,
        raw_response=result.raw_response,
        payment_snapshot=json.loads(req.pricing_snapshot) if req.pricing_snapshot else None,
    )
    mark_payment_links_paid(db, req)
    send_booking_confirmed_email(db, req, booking, space, location)
    db.commit()
    return req, booking, payment
