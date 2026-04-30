from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.deps import get_db
from app.models.booking_request import BookingRequest
from app.models.booking import Booking
from app.models.enums import (
    BookingRequestKind,
    BookingRequestStatus,
    BookingStatus,
    SubscriptionStatusEnum,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from datetime import datetime, time, timezone

from app.models.customer_owner_payment_method import CustomerOwnerPaymentMethod
from app.models.membership_plan import MembershipPlan
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.pricing_rule import PricingRule
from app.models.subscription import Subscription
from app.models.tax_config import TaxConfig
from app.models.feature_flag import FeatureFlag
from app.models.user import User
from app.schemas.booking_request import (
    BookingPaymentSummary,
    BookingRequestCreate,
    BookingRequestDecision,
    BookingRequestOut,
    BookingRequestRetryPayment,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, require_location_roles
from app.services.availability import booking_overlaps, booking_request_overlaps, subscription_overlaps
from app.services.booking_modes import RECURRING_BOOKING_MODES
from app.services.booking_payments import cancellation_deadline_for_request, charge_booking_request, refund_booking_payment
from app.services.meeting_room_balance import (
    add_months,
    current_period_bounds,
    write_grant,
)
from app.services.membership_subscriptions import (
    MembershipBillingError,
    create_subscription as create_stripe_subscription,
)
from app.services.owner_payments import require_payment_method_for_request
from app.services.pricing import (
    EstimateResult,
    VolumeDiscount,
    estimate_booking_price,
)
from app.services.notifications import send_email
from app.services.audit import write_audit_log
from app.services.platform_auth import get_audit_actor_context

router = APIRouter()


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


def _to_out(
    req: BookingRequest,
    space: Space | None,
    booking: Booking | None = None,
    db: Session | None = None
) -> BookingRequestOut:
    price_daily = space.price_daily if space else None
    price_monthly = space.price_monthly if space else None
    price_hourly = space.price_hourly if space else None
    estimated = None
    estimate: EstimateResult | None = None
    request_kind = req.request_kind or BookingRequestKind.HOURLY_BOOKING.value
    is_membership = request_kind in (
        BookingRequestKind.MEMBERSHIP_PURCHASE.value,
        BookingRequestKind.LEASE_PURCHASE.value,
    )
    membership_plan_public_id = None
    if db and is_membership and req.membership_plan_id:
        plan = db.query(MembershipPlan).filter(MembershipPlan.id == req.membership_plan_id).first()
        if plan:
            membership_plan_public_id = plan.public_id
            estimated = plan.price_cents // 100
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
            location = db.query(Location).filter(Location.id == space.location_id).first()
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
        estimated = estimate.total_cents // 100 if estimate else None
    payment_method_public_id = None
    if db and req.customer_owner_payment_method_id:
        payment_method = (
            db.query(CustomerOwnerPaymentMethod)
            .filter(CustomerOwnerPaymentMethod.id == req.customer_owner_payment_method_id)
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
                failure_reason=last_payment.failure_reason,
                attempted_at=last_payment.created_at,
            )
            failure_reason = last_payment.failure_reason
    return BookingRequestOut(
        public_id=req.public_id,
        space_id=req.space_id,
        space_public_id=space.public_id if space else None,
        user_id=req.user_id,
        booking_id=req.booking_id,
        booking_public_id=booking.public_id if booking else None,
        start_datetime=req.start_datetime,
        end_datetime=req.end_datetime,
        status=req.status,
        payment_status=req.payment_status,
        payment_provider=req.payment_provider,
        customer_owner_payment_method_public_id=payment_method_public_id,
        approved_at=req.approved_at,
        cancelled_at=req.cancelled_at,
        cancellation_deadline_at=req.cancellation_deadline_at,
        payment_authorization_consent_at=req.payment_authorization_consent_at,
        operator_notes=req.operator_notes,
        price_daily=price_daily,
        price_monthly=price_monthly,
        price_hourly=price_hourly,
        estimated_amount=estimated,
        base_amount_cents=estimate.base_cents if estimate else None,
        discount_percent=estimate.discount_percent if estimate else 0,
        discount_amount_cents=estimate.discount_cents if estimate else 0,
        tax_amount_cents=estimate.tax_cents if estimate else 0,
        rate_basis=estimate.rate_basis if estimate else None,
        units=estimate.units if estimate else None,
        payment_attempt_count=req.payment_attempt_count,
        failure_reason=failure_reason,
        last_payment=last_payment_summary,
        request_kind=BookingRequestKind(request_kind),
        membership_plan_public_id=membership_plan_public_id,
        desired_start_date=req.desired_start_date,
        seats_requested=req.seats_requested or 1,
        commitment_months_snapshot=req.commitment_months_snapshot,
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
        db.query(CustomerOwnerPaymentMethod)
        .filter(CustomerOwnerPaymentMethod.id == req.customer_owner_payment_method_id)
        .first()
        if req.customer_owner_payment_method_id
        else None
    )
    if not setting or not method or method.status != "active":
        raise HTTPException(
            status_code=400, detail="Customer payment method is no longer valid"
        )

    try:
        result = create_stripe_subscription(
            setting=setting,
            plan=plan,
            payment_method=method,
            commitment_months=plan.commitment_months,
            metadata={
                "booking_request_public_id": req.public_id,
                "membership_plan_public_id": plan.public_id,
            },
        )
    except MembershipBillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    desired_start = req.desired_start_date
    months = plan.commitment_months or 1
    commitment_end = add_months(desired_start, months) if plan.commitment_months else None

    sub = Subscription(
        user_id=req.user_id,
        space_id=req.space_id,
        tenant_id=req.tenant_id,
        status=SubscriptionStatusEnum.PENDING_PAYMENT.value,
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
            payload.customer_owner_payment_method_public_id,
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

    start_dt = datetime.combine(desired_start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(commitment_end, time.min, tzinfo=timezone.utc)

    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=user.id,
        space_id=space.id,
        start_datetime=start_dt,
        end_datetime=end_dt,
        status=BookingRequestStatus.REQUESTED,
        owner_payment_setting_id=owner_payment_setting.id if owner_payment_setting else None,
        payment_provider=owner_payment_setting.provider if owner_payment_setting else None,
        customer_owner_payment_method_id=payment_method.id if payment_method else None,
        payment_status="not_charged" if owner_payment_setting else None,
        payment_authorization_consent_at=consent_at,
        request_kind=_kind_for_booking_mode(plan.booking_mode).value,
        membership_plan_id=plan.id,
        desired_start_date=desired_start,
        seats_requested=payload.seats_requested,
        commitment_months_snapshot=plan.commitment_months,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.post("/booking-requests", response_model=BookingRequestOut)
def create_booking_request(
    payload: BookingRequestCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)

    if payload.membership_plan_public_id:
        req = _create_membership_purchase_request(payload, user, db)
        space = db.query(Space).filter(Space.id == req.space_id).first()
        send_email(user.email, "Membership request submitted", f"Request {req.public_id} submitted.")
        return _to_out(req, space, None, db)

    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    if subscription_overlaps(db, space.id, payload.start_datetime.date(), payload.end_datetime.date()):
        raise HTTPException(status_code=409, detail="Space already subscribed for that date")

    if booking_overlaps(db, space.id, payload.start_datetime, payload.end_datetime):
        raise HTTPException(status_code=409, detail="Booking overlaps existing booking")

    if booking_request_overlaps(db, space.id, payload.start_datetime, payload.end_datetime):
        raise HTTPException(status_code=409, detail="Booking request already exists for that time")

    owner_payment_setting = None
    payment_method = None
    consent_at = None
    if settings.PAYMENT_METHOD_REQUIRED_FOR_REQUEST:
        owner_payment_setting, payment_method, consent_at = require_payment_method_for_request(
            db,
            user,
            space,
            payload.customer_owner_payment_method_public_id,
            payload.payment_authorization_consent,
        )

    instant = _instant_booking_enabled(db, space)
    is_day_pass = bool(payload.full_day) or payload.booking_mode == "day_pass"
    chosen_kind = (
        BookingRequestKind.DAILY_BOOKING.value
        if is_day_pass
        else BookingRequestKind.HOURLY_BOOKING.value
    )
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=user.id,
        space_id=space.id,
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        status=BookingRequestStatus.APPROVED if instant and not settings.PAYMENT_CHARGE_ON_APPROVAL else BookingRequestStatus.REQUESTED,
        owner_payment_setting_id=owner_payment_setting.id if owner_payment_setting else None,
        payment_provider=owner_payment_setting.provider if owner_payment_setting else None,
        customer_owner_payment_method_id=payment_method.id if payment_method else None,
        payment_status="not_charged" if owner_payment_setting else None,
        payment_authorization_consent_at=consent_at,
        request_kind=chosen_kind,
    )
    req.cancellation_deadline_at = cancellation_deadline_for_request(db, req, space)
    db.add(req)
    db.commit()
    db.refresh(req)
    if instant and settings.PAYMENT_CHARGE_ON_APPROVAL:
        req, booking, _payment = charge_booking_request(db, req)
        if req.status == BookingRequestStatus.APPROVED:
            send_email(user.email, "Booking approved", f"Request {req.public_id} approved instantly.")
        return _to_out(req, space, booking, db)
    if instant:
        booking = Booking(
            user_id=req.user_id,
            space_id=req.space_id,
            tenant_id=req.tenant_id,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            status=BookingStatus.PENDING
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)
        req.booking_id = booking.id
        db.add(req)
        db.commit()
        db.refresh(req)
        send_email(user.email, "Booking approved", f"Request {req.public_id} approved instantly.")
        return _to_out(req, space, booking, db)

    send_email(user.email, "Booking request submitted", f"Request {req.public_id} submitted.")
    return _to_out(req, space, None, db)


@router.get("/booking-requests", response_model=list[BookingRequestOut])
def list_booking_requests(
    status: BookingRequestStatus | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(BookingRequest)

    if user.role == UserAppRole.CUSTOMER:
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
    for req in query.all():
        space = db.query(Space).filter(Space.id == req.space_id).first()
        booking = None
        if req.booking_id:
            booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        results.append(_to_out(req, space, booking, db))
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
    if user.role == UserAppRole.CUSTOMER:
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
    return _to_out(req, space, booking, db)


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

    is_membership_request = req.request_kind in (
        BookingRequestKind.MEMBERSHIP_PURCHASE.value,
        BookingRequestKind.LEASE_PURCHASE.value,
    )

    if req.status == BookingRequestStatus.APPROVED and req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        return _to_out(req, space, booking, db)

    if req.status == BookingRequestStatus.APPROVED and is_membership_request:
        # Already approved memberships have no booking row; just return.
        return _to_out(req, space, None, db)

    if req.status not in (BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED):
        raise HTTPException(status_code=400, detail="Request already processed")

    if is_membership_request:
        before_status = req.status
        req = _approve_membership_request(db, req, payload.operator_notes)
        after_status = req.status
        booking = None
    elif settings.PAYMENT_CHARGE_ON_APPROVAL:
        before_status = req.status
        req, booking, payment = charge_booking_request(db, req, operator_notes=payload.operator_notes)
        after_status = req.status
    else:
        before_status = req.status
        req.status = BookingRequestStatus.APPROVED
        req.operator_notes = payload.operator_notes
        req.approved_at = datetime.now(timezone.utc)
        db.add(req)
        db.commit()
        db.refresh(req)

        booking = Booking(
            user_id=req.user_id,
            space_id=req.space_id,
            tenant_id=req.tenant_id,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            status=BookingStatus.PENDING
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)
        req.booking_id = booking.id
        db.add(req)
        db.commit()
        db.refresh(req)
        after_status = req.status
    customer = db.query(User).filter(User.id == req.user_id).first()
    if customer and req.status == BookingRequestStatus.APPROVED:
        send_email(customer.email, "Booking request approved", f"Request {req.public_id} approved.")
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_request_approved" if req.status == BookingRequestStatus.APPROVED else "booking_request_payment_failed",
        entity_type="booking_request",
        entity_public_id=req.public_id,
        before_state={"status": before_status.value},
        after_state={"status": after_status.value, "payment_status": req.payment_status},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db)


@router.post("/booking-requests/{public_id}/retry-payment", response_model=BookingRequestOut)
def retry_booking_request_payment(
    public_id: str,
    payload: BookingRequestRetryPayment,
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
    if req.status != BookingRequestStatus.PAYMENT_FAILED:
        raise HTTPException(status_code=400, detail="Request is not payment failed")
    req, booking, _payment = charge_booking_request(db, req, operator_notes=payload.operator_notes)
    return _to_out(req, space, booking, db)


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

    req.status = BookingRequestStatus.REJECTED
    req.operator_notes = payload.operator_notes
    db.add(req)
    db.commit()
    db.refresh(req)
    customer = db.query(User).filter(User.id == req.user_id).first()
    if customer:
        send_email(customer.email, "Booking request rejected", f"Request {req.public_id} rejected.")
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_request_rejected",
        entity_type="booking_request",
        entity_public_id=req.public_id,
        before_state={"status": BookingRequestStatus.REQUESTED.value},
        after_state={"status": req.status.value},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db)


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

    is_customer = user.role == UserAppRole.CUSTOMER
    if is_customer:
        if req.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking request not found")
    else:
        require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})

    if req.status in (BookingRequestStatus.CANCELLED, BookingRequestStatus.REJECTED):
        return _to_out(req, space, None, db)

    now = datetime.now(timezone.utc)
    booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    if is_customer and booking and req.cancellation_deadline_at and now > _as_utc(req.cancellation_deadline_at):
        raise HTTPException(status_code=400, detail="Cancellation deadline has passed")

    if booking:
        payment = refund_booking_payment(db, req=req, booking=booking)
        booking.status = BookingStatus.CANCELED
        db.add(booking)
        req.payment_status = payment.status.value if payment else "cancelled"
    else:
        req.payment_status = req.payment_status or "not_charged"

    req.status = BookingRequestStatus.CANCELLED
    req.cancelled_at = now
    db.add(req)
    db.commit()
    db.refresh(req)
    if booking:
        db.refresh(booking)
    customer = db.query(User).filter(User.id == req.user_id).first()
    if customer:
        send_email(customer.email, "Booking canceled", f"Request {req.public_id} has been canceled.")
    return _to_out(req, space, booking, db)
