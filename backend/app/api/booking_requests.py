import json
import logging
import secrets
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user
from app.core.config import settings
from app.core.observability import capture_exception
from app.db.deps import get_db
from app.models.booking_request import BookingRequest
from app.models.booking import Booking
from app.models.booking_series import BookingSeries
from app.models.enums import (
    BookingRequestKind,
    BookingRequestStatus,
    BookingStatus,
    LocationStatus,
    SpaceType,
    SpaceVisibility,
    SubscriptionStatusEnum,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.loyalty import LoyaltyRedemptionLock
from datetime import datetime, time, timezone

from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.membership_plan import MembershipPlan
from app.models.organization_member import OrganizationMember
from app.models.organization import Organization
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.pricing_rule import PricingRule
from app.models.subscription import Subscription
from app.models.tax_config import TaxConfig
from app.models.feature_flag import FeatureFlag
from app.models.user import User
from sqlalchemy.exc import IntegrityError
from app.schemas.booking_request import (
    BookingEmailDeliveryOut,
    BookingEmailResendRequest,
    BookingPaymentSummary,
    BookingPricePreviewCreate,
    BookingPricePreviewLineItem,
    BookingPricePreviewOut,
    BookingRequestCreate,
    BookingRequestDecision,
    BookingRequestOut,
    BookingRequestPaymentMethodUpdate,
    BookingRequestRetryPayment,
    BookingRequestSupportContact,
    GuestBookingRequestCreate,
    GuestBookingRequestOut,
)
from app.services.auth_user import get_or_create_user, require_verified_email_for_payments
from app.services.authz import accessible_location_ids, require_location_roles, user_can_access_location
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
    BOOKING_EMAIL_TYPES,
    delivery_details_for_request,
    delivery_summary_for_request,
)
from app.services.availability import subscription_overlaps
from app.services.booking_inventory import (
    booking_blocks_inventory,
    create_pending_booking_hold,
    expand_occurrences,
    is_shared_desk_day_pass,
    validate_no_exact_duplicate_user_slot,
    validate_occurrences_available,
)
from app.services.booking_waitlist import mark_waitlist_booked, validate_waitlist_invite_for_request
from app.services.booking_modes import RECURRING_BOOKING_MODES
from app.services.booking_products import validate_direct_booking_product
from app.services.booking_payments import (
    build_direct_booking_pricing_snapshot,
    build_membership_pricing_snapshot,
    cancellation_deadline_for_request,
    charge_booking_request,
    refund_booking_payment,
)
from app.services.booking_payments import cancel_payment_hold_for_request
from app.services.meeting_room_balance import (
    add_months,
    current_period_bounds,
    write_grant,
)
from app.services.membership_subscriptions import (
    MembershipBillingError,
    create_subscription as create_stripe_subscription,
)
from app.services.owner_payments import (
    ensure_payment_method_chargeable,
    require_payment_method_for_request,
    require_space_payment_ready_for_booking,
    require_space_payment_ready_for_public_surface,
)
from app.services.payment_metadata import normalize_payment_failure_reason
from app.services.pricing import (
    EstimateResult,
    VolumeDiscount,
    estimate_booking_price,
)
from app.services.money import cents_to_money
from app.services.loyalty import active_lock_by_public_id, attach_lock_to_booking_request, release_redemption_for_request
from app.services.notifications import (
    send_booking_confirmed_email,
    send_booking_cancelled_email,
    send_booking_request_cancelled_email,
    send_booking_payment_failed_email,
    send_booking_rejected_email,
    send_booking_request_submitted_email,
    send_owner_booking_cancelled_notification,
    send_owner_confirmed_booking_notification,
    send_owner_booking_payment_failed_notification,
    send_owner_booking_request_notification,
)
from app.services.audit import write_audit_log
from app.services.platform_auth import get_audit_actor_context, organization_is_publicly_visible
from app.services.access_passes import (
    ensure_access_passes_for_booking_request,
    ensure_guest_user_for_request,
    revoke_access_passes_for_request,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _run_booking_request_side_effect(db: Session, label: str, callback) -> None:
    try:
        callback()
    except Exception as exc:
        db.rollback()
        logger.exception("booking request side effect failed: %s", label)
        capture_exception(exc)


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _granularity_to_minutes(value) -> int:
    raw = getattr(value, "value", value)
    return {"30m": 30, "60m": 60, "120m": 120, "daily": 24 * 60}.get(raw, 60)


def _active_volume_discounts(db: Session, space_id: int) -> list[VolumeDiscount]:
    """Load active volume-discount tiers for a space. Returns [] until Phase B model lands."""
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
    return [
        VolumeDiscount(min_hours=float(r.min_hours), discount_percent=int(r.discount_percent))
        for r in rows
    ]


def _get_active_pricing_rule(db: Session, space_id: int) -> PricingRule | None:
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


def _require_public_booking_space(
    db: Session,
    space: Space,
    location: Location,
    *,
    allow_unlisted: bool,
) -> Organization:
    organization = db.query(Organization).filter(Organization.id == location.organization_id).first()
    allowed_visibility = {SpaceVisibility.PUBLIC}
    if allow_unlisted:
        allowed_visibility.add(SpaceVisibility.UNLISTED)
    if (
        space.visibility not in allowed_visibility
        or location.status != LocationStatus.ACTIVE
        or not organization_is_publicly_visible(organization)
    ):
        raise HTTPException(status_code=404, detail="Space not found")
    return organization


def _instant_booking_enabled(db: Session, space: Space) -> bool:
    space_flag = db.query(FeatureFlag).filter(
        FeatureFlag.scope_type == "space",
        FeatureFlag.scope_id == space.id,
        FeatureFlag.flag_key == "instant_booking_enabled",
        FeatureFlag.flag_value.is_(True)
    ).first()
    if space_flag:
        return True
    tenant_flag = db.query(FeatureFlag).filter(
        FeatureFlag.scope_type == "tenant",
        FeatureFlag.scope_id == space.tenant_id,
        FeatureFlag.flag_key == "instant_booking_enabled",
        FeatureFlag.flag_value.is_(True)
    ).first()
    return tenant_flag is not None


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


def _normalized_approval_mode(mode: str | None) -> str:
    mode = mode or "manual"
    return mode if mode in {"manual", "auto"} else "manual"


def _booking_approval_mode_for_org(organization: Organization | None) -> str:
    return _normalized_approval_mode(organization.booking_approval_mode if organization else None)


def _membership_lease_approval_mode_for_org(organization: Organization | None) -> str:
    return _normalized_approval_mode(
        organization.membership_lease_approval_mode if organization else None
    )


def _approval_mode_for_request(req: BookingRequest, organization: Organization | None) -> str:
    if req.request_kind in {
        BookingRequestKind.MEMBERSHIP_PURCHASE.value,
        BookingRequestKind.LEASE_PURCHASE.value,
    }:
        return "auto" if req.instant_booking else "manual"
    if req.instant_booking:
        return "auto"
    return "manual"


def _payment_hold_is_expired(req: BookingRequest) -> bool:
    if not req.payment_hold_expires_at:
        return False
    return datetime.now(timezone.utc) > _as_utc(req.payment_hold_expires_at)


def _to_out(
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
            rule = _get_active_pricing_rule(db, space.id)
            if rule:
                rate_type = rule.rate_type
                rate_amount = rule.rate_amount
            tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
            if tax:
                tax_rate = tax.rate_percent
            if location and location.booking_granularity:
                granularity_minutes = _granularity_to_minutes(location.booking_granularity)
            volume_discounts = _active_volume_discounts(db, space.id)

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
        booking_approval_mode=_approval_mode_for_request(req, organization),
        membership_lease_approval_mode=_membership_lease_approval_mode_for_org(organization),
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


def _approve_membership_request(
    db: Session, req: BookingRequest, operator_notes: str | None
) -> BookingRequest:
    plan = db.query(MembershipPlan).filter(MembershipPlan.id == req.membership_plan_id).first()
    if not plan:
        raise HTTPException(status_code=400, detail="Plan no longer exists")
    setting = (
        db.query(OwnerPaymentSetting)
        .filter(OwnerPaymentSetting.id == req.owner_payment_setting_id)
        .first()
        if req.owner_payment_setting_id
        else None
    )
    method = (
        db.query(MemberOwnerPaymentMethod)
        .filter(MemberOwnerPaymentMethod.id == req.member_owner_payment_method_id)
        .first()
        if req.member_owner_payment_method_id
        else None
    )
    if not setting or not method or method.status != "active":
        raise HTTPException(
            status_code=400, detail="Member payment method is no longer valid"
        )

    desired_start = req.desired_start_date
    months = plan.commitment_months or 1
    commitment_end = add_months(desired_start, months) if plan.commitment_months else None
    if _is_exclusive_lease_mode(plan.booking_mode):
        space = db.query(Space).filter(Space.id == req.space_id).first()
        if not space:
            raise HTTPException(status_code=400, detail="Space no longer exists")
        _ensure_lease_window_available(
            db,
            space=space,
            start=desired_start,
            end=commitment_end,
            ignore_booking_request_id=req.id,
        )

    setup_fee_items: list[dict] = []
    if req.pricing_snapshot:
        try:
            parsed_snapshot = json.loads(req.pricing_snapshot)
            if isinstance(parsed_snapshot, dict):
                setup_fee_items = [
                    item
                    for item in parsed_snapshot.get("line_items", [])
                    if isinstance(item, dict) and item.get("type") == "setup_fee"
                ]
        except json.JSONDecodeError:
            setup_fee_items = []

    try:
        result = create_stripe_subscription(
            setting=setting,
            plan=plan,
            payment_method=method,
            commitment_months=plan.commitment_months,
            setup_fee_items=setup_fee_items,
            metadata={
                "booking_request_public_id": req.public_id,
                "membership_plan_public_id": plan.public_id,
            },
        )
    except MembershipBillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    sub = Subscription(
        user_id=req.user_id,
        space_id=req.space_id,
        tenant_id=req.tenant_id,
        status=(
            SubscriptionStatusEnum.ACTIVE.value
            if result.status in {"active", "trialing"}
            else SubscriptionStatusEnum.PENDING_PAYMENT.value
        ),
        start_date=desired_start,
        end_date=commitment_end,
        stripe_subscription_id=result.subscription_id,
        membership_plan_id=plan.id,
        booking_mode=plan.booking_mode,
        commitment_months=plan.commitment_months,
        commitment_start_date=desired_start,
        commitment_end_date=commitment_end,
        included_meeting_room_hours_per_month=plan.included_meeting_room_hours_per_month,
        auto_renew=plan.auto_renew,
    )
    db.add(sub)
    db.flush()

    if plan.included_meeting_room_hours_per_month > 0:
        period_start, period_end = current_period_bounds(sub, as_of=desired_start)
        write_grant(
            db,
            sub,
            period_start=period_start,
            period_end=period_end,
            minutes=plan.included_meeting_room_hours_per_month * 60,
            description=f"Initial grant on plan {plan.public_id}",
        )

    req.status = BookingRequestStatus.APPROVED
    req.approved_at = datetime.now(timezone.utc)
    req.operator_notes = operator_notes
    req.payment_status = "subscription_created"
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def _kind_for_booking_mode(booking_mode: str) -> BookingRequestKind:
    if booking_mode in {"private_office_lease", "suite_lease"}:
        return BookingRequestKind.LEASE_PURCHASE
    return BookingRequestKind.MEMBERSHIP_PURCHASE


def _create_membership_purchase_request(
    payload: BookingRequestCreate,
    user: User,
    db: Session,
) -> BookingRequest:
    plan = (
        db.query(MembershipPlan)
        .filter(MembershipPlan.public_id == payload.membership_plan_public_id)
        .first()
    )
    if not plan or not plan.is_active:
        raise HTTPException(status_code=404, detail="Membership plan not found")

    space = db.query(Space).filter(Space.id == plan.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    organization = _require_public_booking_space(db, space, location, allow_unlisted=True)
    require_space_payment_ready_for_booking(db, space)
    instant = _membership_lease_approval_mode_for_org(organization) == "auto"

    mode_row = (
        db.query(SpaceBookingMode)
        .filter(
            SpaceBookingMode.space_id == space.id,
            SpaceBookingMode.booking_mode == plan.booking_mode,
            SpaceBookingMode.is_enabled.is_(True),
        )
        .first()
    )
    if not mode_row:
        raise HTTPException(
            status_code=400,
            detail="This booking mode is not currently enabled for the space",
        )

    if plan.max_active_subscriptions:
        active_count = (
            db.query(Subscription)
            .filter(
                Subscription.membership_plan_id == plan.id,
                Subscription.status.in_(["active", "past_due"]),
            )
            .count()
        )
        if active_count >= plan.max_active_subscriptions:
            raise HTTPException(status_code=409, detail="This plan is sold out")

    owner_payment_setting = None
    payment_method = None
    consent_at = None
    if settings.PAYMENT_METHOD_REQUIRED_FOR_REQUEST:
        owner_payment_setting, payment_method, consent_at = require_payment_method_for_request(
            db,
            user,
            space,
            payload.member_owner_payment_method_public_id,
            payload.payment_authorization_consent,
        )

    if (
        plan.booking_mode in {m.value for m in RECURRING_BOOKING_MODES}
        and owner_payment_setting
        and owner_payment_setting.provider != "stripe"
    ):
        raise HTTPException(
            status_code=400,
            detail="Recurring memberships require Stripe; this owner is on CardPointe",
        )

    desired_start = payload.desired_start_date
    months = plan.commitment_months or 1
    commitment_end = add_months(desired_start, months)
    if _is_exclusive_lease_mode(plan.booking_mode):
        _ensure_lease_window_available(
            db,
            space=space,
            start=desired_start,
            end=commitment_end,
        )

    start_dt = datetime.combine(desired_start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(commitment_end, time.min, tzinfo=timezone.utc)
    pricing_snapshot = build_membership_pricing_snapshot(db, plan=plan, space=space)

    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=user.id,
        space_id=space.id,
        start_datetime=start_dt,
        end_datetime=end_dt,
        status=BookingRequestStatus.REQUESTED,
        owner_payment_setting_id=owner_payment_setting.id if owner_payment_setting else None,
        payment_provider=owner_payment_setting.provider if owner_payment_setting else None,
        member_owner_payment_method_id=payment_method.id if payment_method else None,
        payment_status="not_charged" if owner_payment_setting else None,
        payment_authorization_consent_at=consent_at,
        request_kind=_kind_for_booking_mode(plan.booking_mode).value,
        instant_booking=instant,
        membership_plan_id=plan.id,
        desired_start_date=desired_start,
        seats_requested=payload.seats_requested,
        commitment_months_snapshot=plan.commitment_months,
        pricing_snapshot=json.dumps(pricing_snapshot),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def _owner_notification_recipients_for_space(db: Session, space: Space) -> list[tuple[str, str, int]]:
    """Return opted-in owner-side users who can access this space's location."""
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        return []
    roles = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}
    members = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == location.organization_id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.receives_new_booking_email.is_(True),
            OrganizationMember.role.in_(roles),
        )
        .all()
    )
    accessible_members = [
        member
        for member in members
        if user_can_access_location(db, member.user_id, location, roles)
    ]
    user_ids = {member.user_id for member in accessible_members}
    if not user_ids:
        return []
    users = {user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()}
    recipients = []
    seen_emails: set[str] = set()
    for member in accessible_members:
        user = users.get(member.user_id)
        if not user or not user.email or user.email in seen_emails:
            continue
        seen_emails.add(user.email)
        recipients.append((user.email, member.role.value, user.id))
    return sorted(recipients, key=lambda item: item[0])


def _owner_notification_emails_for_space(db: Session, space: Space) -> list[str]:
    return [email for email, _role, _user_id in _owner_notification_recipients_for_space(db, space)]


def _notify_owner_team_of_request(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    for owner_email, role, user_id in _owner_notification_recipients_for_space(db, space):
        send_owner_booking_request_notification(
            db,
            owner_email,
            req,
            space,
            location,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def _send_booking_request_notifications(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
) -> None:
    try:
        send_booking_request_submitted_email(db, req, space, location, actor_user_id=actor_user_id)
    except Exception:
        logger.exception(
            "Failed to send booking request submitted email request_public_id=%s",
            req.public_id,
        )
    try:
        _notify_owner_team_of_request(db, req, space, location, actor_user_id=actor_user_id)
    except Exception:
        logger.exception(
            "Failed to notify owner team for booking request request_public_id=%s",
            req.public_id,
        )


def _notify_owner_team_of_confirmed_booking(
    db: Session,
    req: BookingRequest,
    booking: Booking | None,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    if not booking:
        return
    for owner_email, role, user_id in _owner_notification_recipients_for_space(db, space):
        send_owner_confirmed_booking_notification(
            db,
            owner_email,
            req,
            booking,
            space,
            location,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def _notify_owner_team_of_payment_failed(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    reason = None
    last_payment = (
        db.query(Payment)
        .filter(Payment.booking_request_id == req.id)
        .order_by(Payment.created_at.desc())
        .first()
    )
    if last_payment and last_payment.failure_reason:
        reason = normalize_payment_failure_reason(last_payment.failure_reason)
    for owner_email, role, user_id in _owner_notification_recipients_for_space(db, space):
        send_owner_booking_payment_failed_notification(
            db,
            owner_email,
            req,
            space,
            location,
            failure_reason=reason,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def _send_payment_failed_notifications(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    try:
        send_booking_payment_failed_email(db, req, space, location, actor_user_id=actor_user_id, resend=resend)
    except Exception:
        logger.exception(
            "Failed to send booking payment failed email request_public_id=%s",
            req.public_id,
        )
    try:
        _notify_owner_team_of_payment_failed(db, req, space, location, actor_user_id=actor_user_id, resend=resend)
    except Exception:
        logger.exception(
            "Failed to notify owner team of payment failure request_public_id=%s",
            req.public_id,
        )


def _notify_owner_team_of_cancelled_booking(
    db: Session,
    req: BookingRequest,
    booking: Booking | None,
    space: Space,
    location: Location,
    *,
    reason: str | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    for owner_email, role, user_id in _owner_notification_recipients_for_space(db, space):
        send_owner_booking_cancelled_notification(
            db,
            owner_email,
            req,
            space,
            location,
            booking=booking,
            reason=reason,
            recipient_role=role,
            recipient_user_id=user_id,
            actor_user_id=actor_user_id,
            resend=resend,
        )


def _send_cancelled_notifications(
    db: Session,
    req: BookingRequest,
    booking: Booking | None,
    space: Space,
    location: Location,
    *,
    reason: str | None = None,
    actor_user_id: int | None = None,
    resend: bool = False,
) -> None:
    try:
        if booking:
            send_booking_cancelled_email(db, booking, req, space, location, actor_user_id=actor_user_id, resend=resend)
        else:
            send_booking_request_cancelled_email(db, req, space, location, actor_user_id=actor_user_id, resend=resend)
    except Exception:
        logger.exception(
            "Failed to send booking cancellation email request_public_id=%s",
            req.public_id,
        )
    try:
        _notify_owner_team_of_cancelled_booking(
            db,
            req,
            booking,
            space,
            location,
            reason=reason,
            actor_user_id=actor_user_id,
            resend=resend,
        )
    except Exception:
        logger.exception(
            "Failed to notify owner team of cancellation request_public_id=%s",
            req.public_id,
        )


def _expire_failed_payment_hold_or_raise(
    db: Session,
    req: BookingRequest,
    space: Space,
    location: Location,
    *,
    actor_user_id: int | None = None,
) -> None:
    if req.status != BookingRequestStatus.PAYMENT_FAILED or not _payment_hold_is_expired(req):
        return
    booking = cancel_payment_hold_for_request(db, req, reason="expired")
    db.commit()
    db.refresh(req)
    if booking:
        db.refresh(booking)
    _send_cancelled_notifications(
        db,
        req,
        booking,
        space,
        location,
        reason="Payment recovery window expired",
        actor_user_id=actor_user_id,
    )
    raise HTTPException(
        status_code=400,
        detail="Payment recovery window expired. Start a new booking request.",
    )


def _audit_context_with_actor_email(db: Session, actor_id: int, context: dict | None) -> dict:
    actor = db.query(User).filter(User.id == actor_id).first()
    merged = dict(context or {})
    if actor and actor.email:
        merged.setdefault("actor_email", actor.email)
    return merged


def _append_operator_note(existing: str | None, note: str) -> str:
    combined = f"{existing.strip()}\n{note}" if existing and existing.strip() else note
    return combined[:1024]


def _cancel_superseded_duplicate_requests(
    db: Session,
    req: BookingRequest,
    *,
    actor_id: int,
    acting_as_user_id: int | None,
    context: dict | None,
) -> int:
    if not req.user_id:
        return 0

    duplicates = (
        db.query(BookingRequest)
        .filter(
            BookingRequest.id != req.id,
            BookingRequest.user_id == req.user_id,
            BookingRequest.space_id == req.space_id,
            BookingRequest.start_datetime == req.start_datetime,
            BookingRequest.end_datetime == req.end_datetime,
            BookingRequest.status.in_(
                [
                    BookingRequestStatus.REQUESTED,
                    BookingRequestStatus.PAYMENT_FAILED,
                ]
            ),
        )
        .all()
    )
    if not duplicates:
        return 0

    now = datetime.now(timezone.utc)
    audit_context = _audit_context_with_actor_email(db, actor_id, context)
    for duplicate in duplicates:
        before_status = duplicate.status
        booking = _booking_for_request(db, duplicate)
        if booking and booking.status != BookingStatus.CANCELED:
            booking.status = BookingStatus.CANCELED
            db.add(booking)
        if duplicate.booking_series_id:
            db.query(Booking).filter(
                Booking.booking_series_id == duplicate.booking_series_id,
                Booking.status == BookingStatus.PENDING,
            ).update({Booking.status: BookingStatus.CANCELED}, synchronize_session=False)
            series = db.query(BookingSeries).filter(BookingSeries.id == duplicate.booking_series_id).first()
            if series and series.status != "cancelled":
                series.status = "cancelled"
                db.add(series)
        release_redemption_for_request(db, duplicate, reason="released")
        revoke_access_passes_for_request(db, duplicate, reason="booking_request_superseded")
        duplicate.status = BookingRequestStatus.CANCELLED
        duplicate.cancelled_at = now
        duplicate.payment_status = duplicate.payment_status or "superseded"
        duplicate.operator_notes = _append_operator_note(
            duplicate.operator_notes,
            f"Superseded by confirmed booking request {req.public_id}.",
        )
        db.add(duplicate)
        write_audit_log(
            db,
            actor_id=actor_id,
            action="booking_request_superseded",
            entity_type="booking_request",
            entity_public_id=duplicate.public_id,
            before_state={"status": before_status.value},
            after_state={
                "status": BookingRequestStatus.CANCELLED.value,
                "superseded_by": req.public_id,
            },
            acting_as_user_id=acting_as_user_id,
            context=audit_context,
        )

    db.commit()
    return len(duplicates)


def _owner_accessible_request(
    db: Session,
    public_id: str,
    user: User,
    *,
    actor_user_id: int | None = None,
) -> tuple[BookingRequest, Space, Location]:
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    _expire_failed_payment_hold_or_raise(db, req, space, location, actor_user_id=actor_user_id or user.id)
    return req, space, location


def _booking_for_request(db: Session, req: BookingRequest) -> Booking | None:
    return db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None


def _request_blocks_inventory(space: Space, req: BookingRequest) -> bool:
    return booking_blocks_inventory(space, request_kind=req.request_kind)


def _booking_insert_conflict_detail(space: Space, req: BookingRequest) -> str:
    if is_shared_desk_day_pass(space, request_kind=req.request_kind):
        return "Not enough shared desk seats are available for that date"
    return "Booking overlaps existing booking"


def _raise_booking_insert_conflict(db: Session, space: Space, req: BookingRequest):
    db.rollback()
    raise HTTPException(status_code=409, detail=_booking_insert_conflict_detail(space, req))


def _create_pending_booking_hold_or_conflict(
    db: Session,
    *,
    req: BookingRequest,
    space: Space,
    occurrence,
) -> Booking:
    try:
        return create_pending_booking_hold(
            db,
            user_id=req.user_id,
            space=space,
            occurrence=occurrence,
            booking_request_id=req.id,
            booking_series_id=req.booking_series_id,
            blocks_inventory=_request_blocks_inventory(space, req),
        )
    except IntegrityError:
        _raise_booking_insert_conflict(db, space, req)


def _activate_booking_series_if_needed(db: Session, req: BookingRequest) -> None:
    if not req.booking_series_id:
        return
    series = db.query(BookingSeries).filter(BookingSeries.id == req.booking_series_id).first()
    if series and series.status != "active":
        series.status = "active"
        db.add(series)
        db.commit()


def _validate_locked_occurrences_available(
    db: Session,
    *,
    space: Space,
    location: Location,
    occurrences,
    ignore_booking_ids: set[int] | None = None,
    ignore_booking_request_id: int | None = None,
    booking_mode: str | None = None,
    full_day: bool = False,
    seats_requested: int = 1,
) -> None:
    db.query(Space).filter(Space.id == space.id).with_for_update().first()
    validate_occurrences_available(
        db,
        space=space,
        location=location,
        occurrences=occurrences,
        ignore_booking_ids=ignore_booking_ids,
        ignore_booking_request_id=ignore_booking_request_id,
        booking_mode=booking_mode,
        full_day=full_day,
        seats_requested=seats_requested,
    )


def _is_exclusive_lease_mode(booking_mode: str | None) -> bool:
    return booking_mode in {"private_office_lease", "suite_lease"}


def _lease_request_overlaps(
    db: Session,
    *,
    space_id: int,
    start: date,
    end: date | None,
    ignore_booking_request_id: int | None = None,
) -> bool:
    end_date = end or date.max
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, time.min, tzinfo=timezone.utc)
    query = db.query(BookingRequest).filter(
        BookingRequest.space_id == space_id,
        BookingRequest.request_kind == BookingRequestKind.LEASE_PURCHASE.value,
        BookingRequest.status.in_(
            [
                BookingRequestStatus.REQUESTED,
                BookingRequestStatus.PAYMENT_FAILED,
            ]
        ),
        BookingRequest.start_datetime < end_dt,
        BookingRequest.end_datetime > start_dt,
    )
    if ignore_booking_request_id:
        query = query.filter(BookingRequest.id != ignore_booking_request_id)
    return query.first() is not None


def _ensure_lease_window_available(
    db: Session,
    *,
    space: Space,
    start: date,
    end: date | None,
    ignore_booking_request_id: int | None = None,
) -> None:
    db.query(Space).filter(Space.id == space.id).with_for_update().first()
    if subscription_overlaps(db, space.id, start, end) or _lease_request_overlaps(
        db,
        space_id=space.id,
        start=start,
        end=end,
        ignore_booking_request_id=ignore_booking_request_id,
    ):
        raise HTTPException(status_code=409, detail="Space already leased for that period")


@router.post("/guest/booking-requests", response_model=GuestBookingRequestOut)
def create_guest_booking_request(
    payload: GuestBookingRequestCreate,
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    if payload.redemption_lock_public_id:
        raise HTTPException(status_code=400, detail="Rewards redemption requires a member account")

    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Space not found")
    _require_public_booking_space(db, space, location, allow_unlisted=False)
    require_space_payment_ready_for_booking(db, space)

    start_dt = _as_utc(payload.start_datetime)
    end_dt = _as_utc(payload.end_datetime)

    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    validate_direct_booking_product(
        space,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        seats_requested=1,
    )

    occurrences = expand_occurrences(
        start_datetime=start_dt,
        end_datetime=end_dt,
        location=location,
        space=space,
    )
    _validate_locked_occurrences_available(
        db,
        space=space,
        location=location,
        occurrences=occurrences,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        seats_requested=1,
    )

    is_day_pass = payload.full_day or payload.booking_mode == "day_pass"
    chosen_kind = (
        BookingRequestKind.DAILY_BOOKING.value if is_day_pass else BookingRequestKind.HOURLY_BOOKING.value
    )
    pricing_snapshot = build_direct_booking_pricing_snapshot(
        db,
        space,
        start_datetime=occurrences[0].start_datetime,
        end_datetime=occurrences[0].end_datetime,
        booking_mode="day_pass" if is_day_pass else "hourly",
        full_day=is_day_pass,
        seats_requested=1,
        occurrence_count=1,
    )
    guest_token = secrets.token_urlsafe(32)
    token_expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=None,
        space_id=space.id,
        start_datetime=occurrences[0].start_datetime,
        end_datetime=occurrences[0].end_datetime,
        status=BookingRequestStatus.REQUESTED,
        request_kind=chosen_kind,
        is_guest_checkout=True,
        guest_email=str(payload.guest_email),
        guest_full_name=payload.guest_full_name,
        guest_phone=payload.guest_phone,
        guest_company_name=payload.guest_company_name,
        guest_notes=payload.guest_notes,
        pricing_snapshot=json.dumps(pricing_snapshot),
        refund_policy_snapshot=json.dumps(pricing_snapshot.get("refund_policy") or {}),
        guest_token=guest_token,
        guest_token_expires_at=token_expires_at,
    )
    req.cancellation_deadline_at = cancellation_deadline_for_request(db, req, space)
    db.add(req)
    db.commit()
    db.refresh(req)

    _send_booking_request_notifications(db, req, space, location)

    return GuestBookingRequestOut(
        public_id=req.public_id,
        status=req.status,
        start_datetime=req.start_datetime,
        end_datetime=req.end_datetime,
        space_public_id=space.public_id,
        estimated_amount=cents_to_money(pricing_snapshot["total_cents"]),
    )


@router.post("/booking-requests/preview", response_model=BookingPricePreviewOut)
def preview_booking_request_price(
    payload: BookingPricePreviewCreate,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    preview_user = get_or_create_user(db, token) if token else None
    if payload.membership_plan_public_id:
        plan = (
            db.query(MembershipPlan)
            .filter(
                MembershipPlan.public_id == payload.membership_plan_public_id,
                MembershipPlan.is_active.is_(True),
            )
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Membership plan not found")
        space = db.query(Space).filter(Space.id == plan.space_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        location = db.query(Location).filter(Location.id == space.location_id).first()
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        _require_public_booking_space(db, space, location, allow_unlisted=True)
        require_space_payment_ready_for_public_surface(db, space)
        snapshot = build_membership_pricing_snapshot(db, plan=plan, space=space)
        return BookingPricePreviewOut(
            base_amount_cents=snapshot["base_cents"],
            setup_fee_amount_cents=snapshot["setup_fee_cents"],
            discount_amount_cents=snapshot["discount_cents"],
            tax_amount_cents=snapshot["tax_cents"],
            total_amount_cents=snapshot["total_cents"],
            rate_basis=snapshot["rate_basis"],
            quantity=snapshot["quantity"],
            line_items=[
                BookingPricePreviewLineItem(
                    label=str(item["label"]),
                    amount_cents=int(item["amount_cents"]),
                )
                for item in snapshot.get("line_items", [])
            ],
        )

    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    _require_public_booking_space(db, space, location, allow_unlisted=True)
    require_space_payment_ready_for_public_surface(db, space)

    start_dt = _as_utc(payload.start_datetime)
    end_dt = _as_utc(payload.end_datetime)
    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    is_day_pass = bool(payload.full_day) or payload.booking_mode == "day_pass"
    validate_direct_booking_product(
        space,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        seats_requested=payload.seats_requested,
    )

    snapshot = build_direct_booking_pricing_snapshot(
        db,
        space,
        start_datetime=start_dt,
        end_datetime=end_dt,
        booking_mode="day_pass" if is_day_pass else "hourly",
        full_day=is_day_pass,
        seats_requested=payload.seats_requested,
        promo_code=payload.promo_code,
        user_id=preview_user.id if preview_user else None,
    )
    return BookingPricePreviewOut(
        base_amount_cents=snapshot["base_cents"],
        setup_fee_amount_cents=snapshot["setup_fee_cents"],
        discount_amount_cents=snapshot["discount_cents"],
        promo_code=snapshot.get("promo_code"),
        promo_code_public_id=snapshot.get("promo_code_public_id"),
        promo_description=snapshot.get("promo_description"),
        promo_discount_amount_cents=snapshot.get("promo_discount_amount_cents") or 0,
        subtotal_after_promo_cents=snapshot.get("subtotal_after_promo_cents"),
        tax_amount_cents=snapshot["tax_cents"],
        total_amount_cents=snapshot["total_cents"],
        rate_basis=snapshot["rate_basis"],
        units=snapshot["units"],
        quantity=snapshot["quantity"],
        line_items=[
            BookingPricePreviewLineItem(
                label=str(item["label"]),
                amount_cents=int(item["amount_cents"]),
            )
            for item in snapshot.get("line_items", [])
        ],
    )


@router.post("/booking-requests", response_model=BookingRequestOut)
def create_booking_request(
    payload: BookingRequestCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)

    if payload.membership_plan_public_id:
        require_verified_email_for_payments(user)
        if payload.redemption_lock_public_id:
            raise HTTPException(status_code=400, detail="Rewards cannot be redeemed for memberships or leases")
        source_waitlist_entry = None
        if payload.source_waitlist_public_id:
            source_plan = (
                db.query(MembershipPlan)
                .filter(MembershipPlan.public_id == payload.membership_plan_public_id)
                .first()
            )
            if not source_plan:
                raise HTTPException(status_code=404, detail="Membership plan not found")
            source_waitlist_entry = validate_waitlist_invite_for_request(
                db,
                public_id=payload.source_waitlist_public_id,
                user_id=user.id,
                space_id=source_plan.space_id,
                membership_plan_id=source_plan.id,
                desired_start_date=payload.desired_start_date,
            )
        req = _create_membership_purchase_request(payload, user, db)
        mark_waitlist_booked(db, entry=source_waitlist_entry, booking_request=req)
        if source_waitlist_entry:
            db.commit()
            db.refresh(req)
        space = db.query(Space).filter(Space.id == req.space_id).first()
        if space:
            location = db.query(Location).filter(Location.id == space.location_id).first()
            if location:
                if req.instant_booking:
                    req = _approve_membership_request(db, req, None)
                    _run_booking_request_side_effect(
                        db,
                        "send_booking_confirmed_email",
                        lambda: send_booking_confirmed_email(
                            db, req, None, space, location, actor_user_id=user.id
                        ),
                    )
                    return _to_out(req, space, None, db)
                _send_booking_request_notifications(db, req, space, location, actor_user_id=user.id)
        return _to_out(req, space, None, db)

    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    organization = _require_public_booking_space(db, space, location, allow_unlisted=True)
    require_space_payment_ready_for_booking(db, space)

    owner_payment_setting = None
    payment_method = None
    consent_at = None
    is_day_pass = bool(payload.full_day) or payload.booking_mode == "day_pass"
    validate_direct_booking_product(
        space,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        seats_requested=payload.seats_requested,
    )
    instant = _booking_approval_mode_for_org(organization) == "auto"
    chosen_kind = (
        BookingRequestKind.DAILY_BOOKING.value
        if is_day_pass
        else BookingRequestKind.HOURLY_BOOKING.value
    )
    occurrences = expand_occurrences(
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        location=location,
        space=space,
        recurrence_frequency=payload.recurrence.frequency if payload.recurrence else None,
        recurrence_interval=payload.recurrence.interval if payload.recurrence else None,
        recurrence_count=payload.recurrence.count if payload.recurrence else None,
        recurrence_until_date=payload.recurrence.until_date if payload.recurrence else None,
    )
    source_waitlist_entry = validate_waitlist_invite_for_request(
        db,
        public_id=payload.source_waitlist_public_id,
        user_id=user.id,
        space_id=space.id,
        start_datetime=occurrences[0].start_datetime,
        end_datetime=occurrences[0].end_datetime,
    )

    validate_no_exact_duplicate_user_slot(
        db,
        user_id=user.id,
        space_id=space.id,
        start_datetime=occurrences[0].start_datetime,
        end_datetime=occurrences[0].end_datetime,
    )
    _validate_locked_occurrences_available(
        db,
        space=space,
        location=location,
        occurrences=occurrences,
        booking_mode="day_pass" if is_day_pass else "hourly",
        full_day=is_day_pass,
        seats_requested=payload.seats_requested,
    )

    pricing_snapshot = build_direct_booking_pricing_snapshot(
        db,
        space,
        start_datetime=occurrences[0].start_datetime,
        end_datetime=occurrences[0].end_datetime,
        booking_mode="day_pass" if is_day_pass else "hourly",
        full_day=is_day_pass,
        seats_requested=payload.seats_requested,
        occurrence_count=len(occurrences),
        promo_code=payload.promo_code,
        user_id=user.id,
    )
    lock = active_lock_by_public_id(db, payload.redemption_lock_public_id, user, space) if payload.redemption_lock_public_id else None
    points_cover_total = False
    if lock:
        estimated_total_cents = int(pricing_snapshot.get("total_cents") or 0)
        points_cover_total = estimated_total_cents > 0 and (lock.discount_cents or 0) >= estimated_total_cents

    if settings.PAYMENT_METHOD_REQUIRED_FOR_REQUEST and not points_cover_total:
        require_verified_email_for_payments(user)
        owner_payment_setting, payment_method, consent_at = require_payment_method_for_request(
            db,
            user,
            space,
            payload.member_owner_payment_method_public_id,
            payload.payment_authorization_consent,
        )
    elif payload.redemption_lock_public_id:
        require_verified_email_for_payments(user)

    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=user.id,
        space_id=space.id,
        start_datetime=occurrences[0].start_datetime,
        end_datetime=occurrences[0].end_datetime,
        status=BookingRequestStatus.REQUESTED,
        owner_payment_setting_id=owner_payment_setting.id if owner_payment_setting else None,
        payment_provider=owner_payment_setting.provider if owner_payment_setting else None,
        member_owner_payment_method_id=payment_method.id if payment_method else None,
        payment_status="not_charged" if owner_payment_setting else None,
        payment_authorization_consent_at=consent_at,
        request_kind=chosen_kind,
        instant_booking=instant,
        recurrence_frequency=payload.recurrence.frequency if payload.recurrence else None,
        recurrence_interval=payload.recurrence.interval if payload.recurrence else None,
        recurrence_count=payload.recurrence.count if payload.recurrence else None,
        recurrence_until_date=payload.recurrence.until_date if payload.recurrence else None,
        occurrence_count=len(occurrences),
        seats_requested=max(1, payload.seats_requested or 1),
        pricing_snapshot=json.dumps(pricing_snapshot),
        refund_policy_snapshot=json.dumps(pricing_snapshot.get("refund_policy") or {}),
    )
    req.cancellation_deadline_at = cancellation_deadline_for_request(db, req, space)
    db.add(req)
    try:
        db.flush()
        if payload.redemption_lock_public_id:
            attach_lock_to_booking_request(db, req, payload.redemption_lock_public_id, user, space)
        if instant:
            series = None
            if len(occurrences) > 1:
                series = BookingSeries(
                    tenant_id=space.tenant_id,
                    user_id=user.id,
                    space_id=space.id,
                    booking_request_id=req.id,
                    recurrence_frequency=payload.recurrence.frequency if payload.recurrence else "single",
                    recurrence_interval=payload.recurrence.interval if payload.recurrence else 1,
                    occurrence_count=len(occurrences),
                    first_start_datetime=occurrences[0].start_datetime,
                    last_end_datetime=occurrences[-1].end_datetime,
                    status="pending_payment",
                )
                db.add(series)
                db.flush()
                req.booking_series_id = series.id
            first_booking = None
            for occurrence in occurrences:
                booking_hold = create_pending_booking_hold(
                    db,
                    user_id=user.id,
                    space=space,
                    occurrence=occurrence,
                    booking_request_id=req.id,
                    booking_series_id=series.id if series else None,
                    blocks_inventory=booking_blocks_inventory(
                        space,
                        booking_mode="day_pass" if is_day_pass else "hourly",
                        full_day=is_day_pass,
                    ),
                )
                if first_booking is None:
                    first_booking = booking_hold
            if first_booking:
                req.booking_id = first_booking.id
            db.add(req)
        db.commit()
        db.refresh(req)
        mark_waitlist_booked(db, entry=source_waitlist_entry, booking_request=req)
        if source_waitlist_entry:
            db.commit()
            db.refresh(req)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Booking overlaps existing booking")

    if instant:
        req, booking, _payment = charge_booking_request(db, req)
        if req.status == BookingRequestStatus.APPROVED:
            _activate_booking_series_if_needed(db, req)
            _run_booking_request_side_effect(
                db,
                "ensure_access_passes",
                lambda: (ensure_access_passes_for_booking_request(db, req), db.commit()),
            )
            _run_booking_request_side_effect(
                db,
                "send_booking_confirmed_email",
                lambda: send_booking_confirmed_email(db, req, booking, space, location, actor_user_id=user.id),
            )
            _run_booking_request_side_effect(
                db,
                "notify_owner_team_confirmed_booking",
                lambda: _notify_owner_team_of_confirmed_booking(db, req, booking, space, location, actor_user_id=user.id),
            )
        elif req.status == BookingRequestStatus.PAYMENT_FAILED:
            _send_payment_failed_notifications(db, req, space, location, actor_user_id=user.id)
        elif req.status == BookingRequestStatus.CANCELLED:
            booking = _booking_for_request(db, req)
            _send_cancelled_notifications(
                db,
                req,
                booking,
                space,
                location,
                reason="Payment failed and the organization cancels failed payments immediately.",
                actor_user_id=user.id,
            )
        return _to_out(req, space, booking, db)
    _send_booking_request_notifications(db, req, space, location, actor_user_id=user.id)
    return _to_out(req, space, None, db)


@router.get("/booking-requests", response_model=list[BookingRequestOut])
def list_booking_requests(
    status: BookingRequestStatus | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(BookingRequest)

    if user.role == UserAppRole.MEMBER:
        query = query.filter(BookingRequest.user_id == user.id)
    else:
        location_ids = accessible_location_ids(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
        if not location_ids:
            return []
        space_ids = [
            space_id
            for space_id, in db.query(Space.id).filter(Space.location_id.in_(location_ids)).all()
        ]
        if not space_ids:
            return []
        query = query.filter(BookingRequest.space_id.in_(space_ids))

    if status is not None:
        query = query.filter(BookingRequest.status == status)

    results: list[BookingRequestOut] = []
    include_email_delivery = user.role != UserAppRole.MEMBER
    for req in query.all():
        space = db.query(Space).filter(Space.id == req.space_id).first()
        booking = None
        if req.booking_id:
            booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        results.append(_to_out(req, space, booking, db, include_email_delivery=include_email_delivery))
    return results


@router.get("/booking-requests/{public_id}", response_model=BookingRequestOut)
def get_booking_request(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if user.role == UserAppRole.MEMBER:
        if req.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking request not found")
        space = db.query(Space).filter(Space.id == req.space_id).first()
        booking = None
        if req.booking_id:
            booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        return _to_out(req, space, booking, db)
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
        detail="Booking request not found",
        status_code=404,
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db, include_email_delivery=True)


@router.get("/booking-requests/{public_id}/email-deliveries", response_model=list[BookingEmailDeliveryOut])
def list_booking_request_email_deliveries(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    req, _space, _location = _owner_accessible_request(db, public_id, user)
    return delivery_details_for_request(db, req, include_raw_error=False)


@router.post("/booking-requests/{public_id}/emails/resend", response_model=list[BookingEmailDeliveryOut])
def resend_booking_request_email(
    public_id: str,
    payload: BookingEmailResendRequest,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    actor_id, _acting_as_user_id, _context = get_audit_actor_context(db, token)
    req, space, location = _owner_accessible_request(db, public_id, user, actor_user_id=actor_id)
    notification_type = payload.notification_type
    if notification_type not in BOOKING_EMAIL_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported email notification type")

    booking = _booking_for_request(db, req)
    if notification_type == BOOKING_EMAIL_REQUEST_SUBMITTED:
        send_booking_request_submitted_email(db, req, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_OWNER_REQUEST:
        _notify_owner_team_of_request(db, req, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_OWNER_CONFIRMED:
        if not booking:
            raise HTTPException(status_code=400, detail="No confirmed booking exists for this request")
        _notify_owner_team_of_confirmed_booking(db, req, booking, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_CONFIRMED:
        if req.status != BookingRequestStatus.APPROVED:
            raise HTTPException(status_code=400, detail="Only approved requests can resend confirmation email")
        send_booking_confirmed_email(db, req, booking, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_REJECTED:
        if req.status != BookingRequestStatus.REJECTED:
            raise HTTPException(status_code=400, detail="Only rejected requests can resend rejection email")
        send_booking_rejected_email(db, req, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_PAYMENT_FAILED:
        if req.status != BookingRequestStatus.PAYMENT_FAILED:
            raise HTTPException(status_code=400, detail="Only payment failed requests can resend payment failure email")
        send_booking_payment_failed_email(db, req, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_OWNER_PAYMENT_FAILED:
        if req.status != BookingRequestStatus.PAYMENT_FAILED:
            raise HTTPException(status_code=400, detail="Only payment failed requests can resend owner payment failure email")
        _notify_owner_team_of_payment_failed(db, req, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_CANCELLED:
        if not booking:
            raise HTTPException(status_code=400, detail="No booking exists for cancellation email")
        send_booking_cancelled_email(db, booking, req, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_REQUEST_CANCELLED:
        if req.status != BookingRequestStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Only cancelled requests can resend cancellation email")
        send_booking_request_cancelled_email(db, req, space, location, actor_user_id=actor_id, resend=True)
    elif notification_type == BOOKING_EMAIL_OWNER_CANCELLED:
        if req.status != BookingRequestStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Only cancelled requests can resend owner cancellation email")
        _notify_owner_team_of_cancelled_booking(
            db,
            req,
            booking,
            space,
            location,
            reason="Booking cancelled",
            actor_user_id=actor_id,
            resend=True,
        )
    return delivery_details_for_request(db, req, include_raw_error=False)


@router.post("/booking-requests/{public_id}/approve", response_model=BookingRequestOut)
def approve_booking_request(
    public_id: str,
    payload: BookingRequestDecision,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).with_for_update().first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    _expire_failed_payment_hold_or_raise(db, req, space, location, actor_user_id=actor_id)

    is_membership_request = req.request_kind in (
        BookingRequestKind.MEMBERSHIP_PURCHASE.value,
        BookingRequestKind.LEASE_PURCHASE.value,
    )

    if req.status == BookingRequestStatus.APPROVED and req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        _run_booking_request_side_effect(
            db,
            "cancel_superseded_duplicate_requests",
            lambda: _cancel_superseded_duplicate_requests(
                db,
                req,
                actor_id=actor_id,
                acting_as_user_id=acting_as_user_id,
                context=context,
            ),
        )
        return _to_out(req, space, booking, db, include_email_delivery=True)

    if req.status == BookingRequestStatus.APPROVED and is_membership_request:
        # Already approved memberships have no booking row; just return.
        _run_booking_request_side_effect(
            db,
            "cancel_superseded_duplicate_requests",
            lambda: _cancel_superseded_duplicate_requests(
                db,
                req,
                actor_id=actor_id,
                acting_as_user_id=acting_as_user_id,
                context=context,
            ),
        )
        return _to_out(req, space, None, db, include_email_delivery=True)

    if req.status not in (BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED):
        raise HTTPException(status_code=400, detail="Request already processed")

    if is_membership_request:
        before_status = req.status
        req = _approve_membership_request(db, req, payload.operator_notes)
        after_status = req.status
        booking = None
    elif req.is_guest_checkout:
        before_status = req.status
        guest_user = ensure_guest_user_for_request(db, req)
        if not guest_user:
            raise HTTPException(status_code=400, detail="Guest email is required")
        occurrences = expand_occurrences(
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            location=location,
            space=space,
        )
        validate_no_exact_duplicate_user_slot(
            db,
            user_id=guest_user.id,
            space_id=space.id,
            start_datetime=occurrences[0].start_datetime,
            end_datetime=occurrences[0].end_datetime,
            ignore_booking_request_id=req.id,
        )
        _validate_locked_occurrences_available(
            db,
            space=space,
            location=location,
            occurrences=occurrences,
            ignore_booking_request_id=req.id,
            booking_mode="day_pass" if req.request_kind == BookingRequestKind.DAILY_BOOKING.value else "hourly",
            full_day=req.request_kind == BookingRequestKind.DAILY_BOOKING.value,
            seats_requested=req.seats_requested or 1,
        )
        req.user_id = guest_user.id
        req.status = BookingRequestStatus.APPROVED
        req.operator_notes = payload.operator_notes
        req.payment_status = req.payment_status or "not_charged"
        req.approved_at = datetime.now(timezone.utc)
        booking = Booking(
            user_id=guest_user.id,
            space_id=req.space_id,
            tenant_id=req.tenant_id,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            inventory_start_datetime=occurrences[0].inventory_start_datetime,
            inventory_end_datetime=occurrences[0].inventory_end_datetime,
            booking_request_id=req.id,
            status=BookingStatus.CONFIRMED,
            blocks_inventory=_request_blocks_inventory(space, req),
        )
        try:
            db.add(booking)
            db.flush()
            req.booking_id = booking.id
            db.add(req)
            db.commit()
        except IntegrityError:
            _raise_booking_insert_conflict(db, space, req)
        db.refresh(booking)
        db.refresh(req)
        after_status = req.status
    elif settings.PAYMENT_CHARGE_ON_APPROVAL:
        before_status = req.status
        if not req.booking_id:
            occurrences = expand_occurrences(
                start_datetime=req.start_datetime,
                end_datetime=req.end_datetime,
                location=location,
                space=space,
            )
            validate_no_exact_duplicate_user_slot(
                db,
                user_id=req.user_id,
                space_id=space.id,
                start_datetime=occurrences[0].start_datetime,
                end_datetime=occurrences[0].end_datetime,
                ignore_booking_request_id=req.id,
            )
            _validate_locked_occurrences_available(
                db,
                space=space,
                location=location,
                occurrences=occurrences,
                ignore_booking_request_id=req.id,
                booking_mode="day_pass" if req.request_kind == BookingRequestKind.DAILY_BOOKING.value else "hourly",
                full_day=req.request_kind == BookingRequestKind.DAILY_BOOKING.value,
                seats_requested=req.seats_requested or 1,
            )
            booking_hold = _create_pending_booking_hold_or_conflict(
                db,
                req=req,
                space=space,
                occurrence=occurrences[0],
            )
            try:
                req.booking_id = booking_hold.id
                db.add(req)
                db.commit()
            except IntegrityError:
                _raise_booking_insert_conflict(db, space, req)
            db.refresh(req)
        req, booking, payment = charge_booking_request(db, req, operator_notes=payload.operator_notes)
        after_status = req.status
    else:
        before_status = req.status
        occurrences = expand_occurrences(
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            location=location,
            space=space,
        )
        validate_no_exact_duplicate_user_slot(
            db,
            user_id=req.user_id,
            space_id=space.id,
            start_datetime=occurrences[0].start_datetime,
            end_datetime=occurrences[0].end_datetime,
            ignore_booking_request_id=req.id,
        )
        _validate_locked_occurrences_available(
            db,
            space=space,
            location=location,
            occurrences=occurrences,
            ignore_booking_request_id=req.id,
            booking_mode="day_pass" if req.request_kind == BookingRequestKind.DAILY_BOOKING.value else "hourly",
            full_day=req.request_kind == BookingRequestKind.DAILY_BOOKING.value,
            seats_requested=req.seats_requested or 1,
        )
        req.status = BookingRequestStatus.APPROVED
        req.operator_notes = payload.operator_notes
        req.approved_at = datetime.now(timezone.utc)
        booking = Booking(
            user_id=req.user_id,
            space_id=req.space_id,
            tenant_id=req.tenant_id,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            inventory_start_datetime=occurrences[0].inventory_start_datetime,
            inventory_end_datetime=occurrences[0].inventory_end_datetime,
            booking_request_id=req.id,
            status=BookingStatus.PENDING,
            blocks_inventory=_request_blocks_inventory(space, req),
        )
        try:
            db.add(booking)
            db.flush()
            req.booking_id = booking.id
            db.add(req)
            db.commit()
        except IntegrityError:
            _raise_booking_insert_conflict(db, space, req)
        db.refresh(booking)
        db.refresh(req)
        after_status = req.status
    if req.status == BookingRequestStatus.APPROVED:
        booking_for_email = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
        _run_booking_request_side_effect(
            db,
            "cancel_superseded_duplicate_requests",
            lambda: _cancel_superseded_duplicate_requests(
                db,
                req,
                actor_id=actor_id,
                acting_as_user_id=acting_as_user_id,
                context=context,
            ),
        )
        _run_booking_request_side_effect(
            db,
            "ensure_access_passes",
            lambda: (ensure_access_passes_for_booking_request(db, req), db.commit()),
        )
        _run_booking_request_side_effect(
            db,
            "send_booking_confirmed_email",
            lambda: send_booking_confirmed_email(db, req, booking_for_email, space, location, actor_user_id=actor_id),
        )
    elif req.status == BookingRequestStatus.PAYMENT_FAILED:
        _send_payment_failed_notifications(db, req, space, location, actor_user_id=actor_id)
    elif req.status == BookingRequestStatus.CANCELLED:
        cancelled_booking = _booking_for_request(db, req)
        _send_cancelled_notifications(
            db,
            req,
            cancelled_booking,
            space,
            location,
            reason="Payment failed and the organization cancels failed payments immediately.",
            actor_user_id=actor_id,
        )
    _run_booking_request_side_effect(
        db,
        "write_audit_log",
        lambda: write_audit_log(
            db,
            actor_id=actor_id,
            action="booking_request_approved" if req.status == BookingRequestStatus.APPROVED else "booking_request_payment_failed",
            entity_type="booking_request",
            entity_public_id=req.public_id,
            before_state={"status": before_status.value},
            after_state={"status": after_status.value, "payment_status": req.payment_status},
            acting_as_user_id=acting_as_user_id,
            context=_audit_context_with_actor_email(db, actor_id, context),
        ),
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db, include_email_delivery=True)


@router.post("/booking-requests/{public_id}/payment-method", response_model=BookingRequestOut)
def update_booking_request_payment_method(
    public_id: str,
    payload: BookingRequestPaymentMethodUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    require_verified_email_for_payments(user)
    if user.role != UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Member only")
    if not payload.payment_authorization_consent:
        raise HTTPException(status_code=400, detail="Payment authorization consent is required")

    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).with_for_update().first()
    if not req or req.user_id != user.id:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if req.status != BookingRequestStatus.PAYMENT_FAILED:
        raise HTTPException(status_code=400, detail="Request is not payment failed")
    if not req.owner_payment_setting_id:
        raise HTTPException(status_code=400, detail="This request does not support card retry")

    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    _expire_failed_payment_hold_or_raise(db, req, space, location, actor_user_id=user.id)

    method = (
        db.query(MemberOwnerPaymentMethod)
        .filter(
            MemberOwnerPaymentMethod.public_id == payload.member_owner_payment_method_public_id,
            MemberOwnerPaymentMethod.user_id == user.id,
            MemberOwnerPaymentMethod.organization_id == req.tenant_id,
            MemberOwnerPaymentMethod.owner_payment_setting_id == req.owner_payment_setting_id,
            MemberOwnerPaymentMethod.status == "active",
        )
        .first()
    )
    if not method:
        raise HTTPException(status_code=400, detail="Payment method is not valid for this request")
    setting = (
        db.query(OwnerPaymentSetting)
        .filter(OwnerPaymentSetting.id == req.owner_payment_setting_id)
        .first()
    )
    if not ensure_payment_method_chargeable(db, method, setting):
        raise HTTPException(status_code=400, detail="Payment method is incomplete; add the card again")

    req.member_owner_payment_method_id = method.id
    req.payment_provider = method.provider
    req.payment_authorization_consent_at = datetime.now(timezone.utc)
    db.add(req)
    db.commit()
    db.refresh(req)
    booking = _booking_for_request(db, req)
    return _to_out(req, space, booking, db)


@router.post("/booking-requests/{public_id}/retry-payment", response_model=BookingRequestOut)
def retry_booking_request_payment(
    public_id: str,
    payload: BookingRequestRetryPayment,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    require_verified_email_for_payments(user)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).with_for_update().first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    is_member_retry = user.role == UserAppRole.MEMBER
    if is_member_retry:
        if req.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking request not found")
        if not req.instant_booking:
            raise HTTPException(status_code=400, detail="Only instant booking payment failures can be retried by members")
        if not req.member_owner_payment_method_id:
            raise HTTPException(status_code=400, detail="Update payment method before retrying")
    else:
        require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    _expire_failed_payment_hold_or_raise(db, req, space, location, actor_user_id=actor_id)
    if req.status != BookingRequestStatus.PAYMENT_FAILED:
        raise HTTPException(status_code=400, detail="Request is not payment failed")
    existing_booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    if not existing_booking or existing_booking.status == BookingStatus.CANCELED:
        occurrences = expand_occurrences(
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            location=location,
            space=space,
        )
        validate_no_exact_duplicate_user_slot(
            db,
            user_id=req.user_id,
            space_id=space.id,
            start_datetime=occurrences[0].start_datetime,
            end_datetime=occurrences[0].end_datetime,
            ignore_booking_request_id=req.id,
        )
        _validate_locked_occurrences_available(
            db,
            space=space,
            location=location,
            occurrences=occurrences,
            booking_mode="day_pass" if req.request_kind == BookingRequestKind.DAILY_BOOKING.value else "hourly",
            full_day=req.request_kind == BookingRequestKind.DAILY_BOOKING.value,
            seats_requested=req.seats_requested or 1,
        )
        booking_hold = _create_pending_booking_hold_or_conflict(
            db,
            req=req,
            space=space,
            occurrence=occurrences[0],
        )
        try:
            req.booking_id = booking_hold.id
            db.add(req)
            db.commit()
        except IntegrityError:
            _raise_booking_insert_conflict(db, space, req)
        db.refresh(req)
    req, booking, _payment = charge_booking_request(db, req, operator_notes=payload.operator_notes)
    if req.status == BookingRequestStatus.APPROVED:
        _activate_booking_series_if_needed(db, req)
        _run_booking_request_side_effect(
            db,
            "cancel_superseded_duplicate_requests",
            lambda: _cancel_superseded_duplicate_requests(
                db,
                req,
                actor_id=actor_id,
                acting_as_user_id=acting_as_user_id,
                context=context,
            ),
        )
        _run_booking_request_side_effect(
            db,
            "ensure_access_passes",
            lambda: (ensure_access_passes_for_booking_request(db, req), db.commit()),
        )
        _run_booking_request_side_effect(
            db,
            "send_booking_confirmed_email",
            lambda: send_booking_confirmed_email(db, req, booking, space, location, actor_user_id=actor_id),
        )
        _run_booking_request_side_effect(
            db,
            "notify_owner_team_confirmed_booking",
            lambda: _notify_owner_team_of_confirmed_booking(db, req, booking, space, location, actor_user_id=actor_id),
        )
    elif req.status == BookingRequestStatus.PAYMENT_FAILED:
        _send_payment_failed_notifications(db, req, space, location, actor_user_id=actor_id)
    elif req.status == BookingRequestStatus.CANCELLED:
        cancelled_booking = _booking_for_request(db, req)
        _send_cancelled_notifications(
            db,
            req,
            cancelled_booking,
            space,
            location,
            reason="Payment failed and the organization cancels failed payments immediately.",
            actor_user_id=actor_id,
        )
    return _to_out(req, space, booking, db, include_email_delivery=True)


@router.post("/booking-requests/{public_id}/reject", response_model=BookingRequestOut)
def reject_booking_request(
    public_id: str,
    payload: BookingRequestDecision,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})

    if req.status != BookingRequestStatus.REQUESTED:
        raise HTTPException(status_code=400, detail="Request already processed")

    release_redemption_for_request(db, req, reason="released")
    req.status = BookingRequestStatus.REJECTED
    req.operator_notes = payload.operator_notes
    req.rejected_at = datetime.now(timezone.utc)
    db.add(req)
    revoke_access_passes_for_request(db, req, reason="booking_request_rejected")
    db.commit()
    db.refresh(req)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    send_booking_rejected_email(db, req, space, location, actor_user_id=actor_id)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_request_rejected",
        entity_type="booking_request",
        entity_public_id=req.public_id,
        before_state={"status": BookingRequestStatus.REQUESTED.value},
        after_state={"status": req.status.value},
        acting_as_user_id=acting_as_user_id,
        context=_audit_context_with_actor_email(db, actor_id, context),
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db, include_email_delivery=True)


@router.post("/booking-requests/{public_id}/cancel", response_model=BookingRequestOut)
def cancel_booking_request(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).with_for_update().first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")

    is_member = user.role == UserAppRole.MEMBER
    if is_member:
        if req.user_id is None or req.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking request not found")
    else:
        require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})

    if req.status in (BookingRequestStatus.CANCELLED, BookingRequestStatus.REJECTED):
        return _to_out(req, space, None, db, include_email_delivery=not is_member)

    now = datetime.now(timezone.utc)
    booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    if is_member and booking and req.cancellation_deadline_at and now > _as_utc(req.cancellation_deadline_at):
        raise HTTPException(status_code=400, detail="Cancellation deadline has passed")

    if booking:
        payment = refund_booking_payment(db, req=req, booking=booking)
        booking.status = BookingStatus.CANCELED
        db.add(booking)
        req.payment_status = payment.status.value if payment else "cancelled"
    else:
        release_redemption_for_request(db, req, reason="released")
        req.payment_status = req.payment_status or "not_charged"

    req.status = BookingRequestStatus.CANCELLED
    req.cancelled_at = now
    db.add(req)
    revoke_access_passes_for_request(db, req, reason="booking_request_cancelled")
    db.commit()
    db.refresh(req)
    if booking:
        db.refresh(booking)
    if booking:
        _send_cancelled_notifications(db, req, booking, space, location, actor_user_id=user.id)
    else:
        _send_cancelled_notifications(db, req, None, space, location, actor_user_id=user.id)
    return _to_out(req, space, booking, db, include_email_delivery=not is_member)
