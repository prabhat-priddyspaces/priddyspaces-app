"""Membership / lease purchase request creation and approval.

Extracted from app/api/booking_requests.py (B2) to keep the router thin and to
isolate the inline Stripe subscription creation. Imports only models / schemas /
other services (never the api package), so there is no import cycle.
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.booking_request import BookingRequest
from app.models.enums import (
    BookingRequestKind,
    BookingRequestStatus,
    SubscriptionStatusEnum,
)
from app.models.location import Location
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.membership_plan import MembershipPlan
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.booking_request import BookingRequestCreate
from app.services.availability import subscription_overlaps
from app.services.booking_approval import membership_lease_approval_mode_for_org
from app.services.booking_modes import RECURRING_BOOKING_MODES
from app.services.booking_payments import build_membership_pricing_snapshot
from app.services.meeting_room_balance import add_months, current_period_bounds, write_grant
from app.services.membership_subscriptions import (
    MembershipBillingError,
    create_subscription as create_stripe_subscription,
)
from app.services.owner_payments import (
    require_payment_method_for_request,
    require_space_payment_ready_for_booking,
)
from app.services.public_booking import require_public_booking_space


def _kind_for_booking_mode(booking_mode: str) -> BookingRequestKind:
    if booking_mode in {"private_office_lease", "suite_lease"}:
        return BookingRequestKind.LEASE_PURCHASE
    return BookingRequestKind.MEMBERSHIP_PURCHASE


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


def approve_membership_request(
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


def create_membership_purchase_request(
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
    organization = require_public_booking_space(db, space, location, allow_unlisted=True)
    require_space_payment_ready_for_booking(db, space)
    instant = membership_lease_approval_mode_for_org(organization) == "auto"

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
