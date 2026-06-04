"""Serialization of BookingRequest models into BookingRequestOut DTOs.

Extracted from app/api/booking_requests.py to keep the router thin. This module
imports only models / schemas / other services (never the api package), so there
is no import cycle.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.booking_series import BookingSeries
from app.models.enums import BookingRequestKind, SpaceType, UserRole
from app.models.location import Location
from app.models.loyalty import LoyaltyRedemptionLock
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.membership_plan import MembershipPlan
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.payment import Payment
from app.models.space import Space
from app.models.tax_config import TaxConfig
from app.models.user import User
from app.schemas.booking_request import (
    BookingPaymentSummary,
    BookingRequestOut,
    BookingRequestSupportContact,
)
from app.services.booking_approval import (
    approval_mode_for_request,
    membership_lease_approval_mode_for_org,
)
from app.services.booking_email_delivery import delivery_summary_for_request
from app.services.money import cents_to_money
from app.services.payment_metadata import normalize_payment_failure_reason
from app.services.pricing import EstimateResult, VolumeDiscount, estimate_booking_price
from app.services.pricing_rules import (
    active_volume_discounts,
    get_active_pricing_rule,
    granularity_to_minutes,
)


def _user_display_name(user: User) -> str | None:
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    parts = [
        part.strip()
        for part in [user.first_name or "", user.last_name or ""]
        if part and part.strip()
    ]
    if parts:
        return " ".join(parts)
    return None


def _contact_title(role: UserRole) -> str:
    if role == UserRole.OWNER:
        return "Owner"
    if role == UserRole.ADMIN:
        return "Admin"
    return "Team"


def _support_contacts_for_location(
    db: Session | None,
    location: Location | None,
) -> list[BookingRequestSupportContact]:
    if db is None or location is None:
        return []
    contact_rows = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(
            OrganizationMember.organization_id == location.organization_id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.role.in_([UserRole.OWNER, UserRole.ADMIN]),
        )
        .all()
    )
    role_priority = {UserRole.OWNER: 0, UserRole.ADMIN: 1}
    contacts: list[BookingRequestSupportContact] = []
    seen_contacts: set[str] = set()
    for member, user in sorted(
        contact_rows,
        key=lambda item: (role_priority.get(item[0].role, 99), item[0].id),
    ):
        name = _user_display_name(user)
        if not name:
            continue
        dedupe_key = name.casefold()
        if dedupe_key in seen_contacts:
            continue
        seen_contacts.add(dedupe_key)
        contacts.append(BookingRequestSupportContact(name=name, title=_contact_title(member.role)))
        if len(contacts) == 2:
            break
    return contacts


def _space_type_value(space: Space | None) -> str | None:
    if not space:
        return None
    return getattr(space.space_type, "value", space.space_type)


def serialize_booking_request_out(
    req: BookingRequest,
    space: Space | None,
    booking: Booking | None = None,
    db: Session | None = None,
    include_email_delivery: bool = False,
) -> BookingRequestOut:
    price_daily = space.price_daily if space else None
    price_monthly = space.price_monthly if space else None
    price_hourly = space.price_hourly if space else None
    location = None
    organization = None
    if db and space:
        location = db.query(Location).filter(Location.id == space.location_id).first()
        organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    estimated = None
    estimate: EstimateResult | None = None
    member = None
    request_kind = req.request_kind or BookingRequestKind.HOURLY_BOOKING.value
    is_membership = request_kind in (
        BookingRequestKind.MEMBERSHIP_PURCHASE.value,
        BookingRequestKind.LEASE_PURCHASE.value,
    )
    membership_plan_public_id = None
    membership_plan_name = None
    if db and req.user_id:
        member = db.query(User).filter(User.id == req.user_id).first()
    if db and is_membership and req.membership_plan_id:
        plan = db.query(MembershipPlan).filter(MembershipPlan.id == req.membership_plan_id).first()
        if plan:
            membership_plan_public_id = plan.public_id
            membership_plan_name = plan.name
            estimated = cents_to_money(plan.price_cents)
    if space and not is_membership:
        rate_type = None
        rate_amount = None
        tax_rate = None
        granularity_minutes = 60
        volume_discounts: list[VolumeDiscount] = []
        if db:
            rule = get_active_pricing_rule(db, space.id)
            if rule:
                rate_type = rule.rate_type
                rate_amount = rule.rate_amount
            tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
            if tax:
                tax_rate = tax.rate_percent
            if location and location.booking_granularity:
                granularity_minutes = granularity_to_minutes(location.booking_granularity)
            volume_discounts = active_volume_discounts(db, space.id)

        # Map request_kind back to engine flags.
        full_day_flag = request_kind == BookingRequestKind.DAILY_BOOKING.value
        booking_mode_flag = "day_pass" if full_day_flag else "hourly"

        estimate = estimate_booking_price(
            req.start_datetime,
            req.end_datetime,
            price_hourly=price_hourly,
            price_daily=price_daily,
            price_monthly=price_monthly,
            rate_type=rate_type,
            rate_amount=rate_amount,
            booking_mode=booking_mode_flag,
            full_day=full_day_flag,
            volume_discounts=volume_discounts,
            granularity_minutes=granularity_minutes,
            tax_rate_percent=tax_rate,
        )
        estimate_quantity = (
            max(1, req.seats_requested or 1)
            if full_day_flag and _space_type_value(space) == SpaceType.SHARED_DESK.value
            else 1
        )
        estimated = cents_to_money(estimate.total_cents * estimate_quantity) if estimate else None
    payment_method_public_id = None
    payment_method = None
    booking_series_public_id = None
    if db and req.booking_series_id:
        series = db.query(BookingSeries).filter(BookingSeries.id == req.booking_series_id).first()
        booking_series_public_id = series.public_id if series else None
    if db and req.member_owner_payment_method_id:
        payment_method = (
            db.query(MemberOwnerPaymentMethod)
            .filter(MemberOwnerPaymentMethod.id == req.member_owner_payment_method_id)
            .first()
        )
        payment_method_public_id = payment_method.public_id if payment_method else None
    last_payment_summary = None
    failure_reason = None
    if db:
        last_payment = (
            db.query(Payment)
            .filter(Payment.booking_request_id == req.id)
            .order_by(Payment.created_at.desc())
            .first()
        )
        if last_payment:
            last_payment_summary = BookingPaymentSummary(
                status=last_payment.status.value if last_payment.status else None,
                amount=last_payment.amount,
                amount_cents=last_payment.amount_cents,
                currency=last_payment.currency,
                attempt_number=last_payment.attempt_number,
                failure_reason=normalize_payment_failure_reason(last_payment.failure_reason) if last_payment.failure_reason else None,
                attempted_at=last_payment.created_at,
            )
            failure_reason = normalize_payment_failure_reason(last_payment.failure_reason) if last_payment.failure_reason else None
    payment_breakdown = None
    refund_policy_snapshot = None
    if req.pricing_snapshot:
        try:
            payment_breakdown = json.loads(req.pricing_snapshot)
        except json.JSONDecodeError:
            payment_breakdown = None
    if isinstance(payment_breakdown, dict):
        try:
            estimated = cents_to_money(int(payment_breakdown["total_cents"]))
        except (KeyError, TypeError, ValueError):
            pass
    if req.refund_policy_snapshot:
        try:
            refund_policy_snapshot = json.loads(req.refund_policy_snapshot)
        except json.JSONDecodeError:
            refund_policy_snapshot = None
    promo_breakdown = payment_breakdown.get("promo") if isinstance(payment_breakdown, dict) else None
    redemption_lock_public_id = None
    loyalty_points_used = 0
    loyalty_discount_cents = 0
    if db and req.loyalty_redemption_lock_id:
        lock = db.query(LoyaltyRedemptionLock).filter(LoyaltyRedemptionLock.id == req.loyalty_redemption_lock_id).first()
        if lock:
            redemption_lock_public_id = lock.public_id
            loyalty_points_used = lock.points or 0
            loyalty_discount_cents = lock.discount_cents or 0
    email_delivery_summary = (
        delivery_summary_for_request(db, req, include_recipients=True)
        if db is not None and include_email_delivery
        else []
    )
    return BookingRequestOut(
        public_id=req.public_id,
        created_at=req.created_at,
        space_id=req.space_id,
        space_public_id=space.public_id if space else None,
        space_name=space.name if space else None,
        space_type=_space_type_value(space),
        organization_name=organization.name if organization else None,
        location_public_id=location.public_id if location else None,
        location_name=location.name if location else None,
        location_address=location.address if location else None,
        location_city=location.city if location else None,
        location_state=location.state if location else None,
        location_postal_code=location.postal_code if location else None,
        location_timezone=location.timezone if location else None,
        location_public_phone=location.public_phone if location else None,
        location_public_email=location.public_email if location else None,
        support_contacts=_support_contacts_for_location(db, location),
        user_id=req.user_id,
        member_public_id=member.public_id if member else None,
        member_name=(
            member.full_name
            or " ".join(part for part in [member.first_name, member.last_name] if part)
            or None
        ) if member else None,
        member_email=member.email if member else None,
        member_phone=member.phone if member else None,
        member_company_name=member.company_name if member else None,
        booking_id=req.booking_id,
        booking_public_id=booking.public_id if booking else None,
        start_datetime=req.start_datetime,
        end_datetime=req.end_datetime,
        status=req.status,
        payment_status=req.payment_status,
        payment_provider=req.payment_provider,
        member_owner_payment_method_public_id=payment_method_public_id,
        payment_method_brand=payment_method.brand if payment_method else None,
        payment_method_last4=payment_method.last4 if payment_method else None,
        payment_method_exp_month=payment_method.exp_month if payment_method else None,
        payment_method_exp_year=payment_method.exp_year if payment_method else None,
        redemption_lock_public_id=redemption_lock_public_id,
        loyalty_points_used=loyalty_points_used,
        loyalty_discount_cents=loyalty_discount_cents,
        promo_code=promo_breakdown.get("code") if isinstance(promo_breakdown, dict) else None,
        promo_description=promo_breakdown.get("description") if isinstance(promo_breakdown, dict) else None,
        promo_discount_amount_cents=(
            int(promo_breakdown.get("discount_amount_cents") or 0)
            if isinstance(promo_breakdown, dict)
            else 0
        ),
        approved_at=req.approved_at,
        rejected_at=req.rejected_at,
        cancelled_at=req.cancelled_at,
        cancellation_deadline_at=req.cancellation_deadline_at,
        payment_hold_expires_at=req.payment_hold_expires_at,
        payment_failed_at=req.payment_failed_at,
        booking_approval_mode=approval_mode_for_request(req, organization),
        membership_lease_approval_mode=membership_lease_approval_mode_for_org(organization),
        payment_failure_hold_minutes=organization.payment_failure_hold_minutes if organization else None,
        payment_authorization_consent_at=req.payment_authorization_consent_at,
        operator_notes=req.operator_notes,
        instant_booking=req.instant_booking or False,
        booking_series_public_id=booking_series_public_id,
        occurrence_count=req.occurrence_count or 1,
        recurrence_frequency=req.recurrence_frequency,
        recurrence_interval=req.recurrence_interval,
        recurrence_count=req.recurrence_count,
        recurrence_until_date=req.recurrence_until_date,
        payment_breakdown=payment_breakdown,
        refund_policy_snapshot=refund_policy_snapshot,
        price_daily=price_daily,
        price_monthly=price_monthly,
        price_hourly=price_hourly,
        estimated_amount=estimated,
        base_amount_cents=(
            int(payment_breakdown["base_cents"])
            if isinstance(payment_breakdown, dict) and payment_breakdown.get("base_cents") is not None
            else estimate.base_cents * estimate_quantity if estimate else None
        ),
        discount_percent=estimate.discount_percent if estimate else 0,
        discount_amount_cents=(
            int(payment_breakdown["discount_cents"])
            if isinstance(payment_breakdown, dict) and payment_breakdown.get("discount_cents") is not None
            else estimate.discount_cents * estimate_quantity if estimate else 0
        ),
        tax_amount_cents=(
            int(payment_breakdown["tax_cents"])
            if isinstance(payment_breakdown, dict) and payment_breakdown.get("tax_cents") is not None
            else estimate.tax_cents * estimate_quantity if estimate else 0
        ),
        rate_basis=(
            str(payment_breakdown["rate_basis"])
            if isinstance(payment_breakdown, dict) and payment_breakdown.get("rate_basis") is not None
            else estimate.rate_basis if estimate else None
        ),
        units=(
            float(payment_breakdown["units"])
            if isinstance(payment_breakdown, dict) and payment_breakdown.get("units") is not None
            else estimate.units if estimate else None
        ),
        payment_attempt_count=req.payment_attempt_count,
        failure_reason=failure_reason,
        last_payment=last_payment_summary,
        email_delivery_summary=email_delivery_summary,
        request_kind=BookingRequestKind(request_kind),
        membership_plan_public_id=membership_plan_public_id,
        membership_plan_name=membership_plan_name,
        desired_start_date=req.desired_start_date,
        seats_requested=req.seats_requested or 1,
        commitment_months_snapshot=req.commitment_months_snapshot,
        is_guest_checkout=req.is_guest_checkout or False,
        guest_email=req.guest_email,
        guest_full_name=req.guest_full_name,
        guest_phone=req.guest_phone,
        guest_company_name=req.guest_company_name,
        guest_notes=req.guest_notes,
    )
