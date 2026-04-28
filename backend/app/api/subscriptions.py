from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.membership_plan import MembershipPlan
from app.models.subscription import Subscription
from app.schemas.subscription import (
    MeetingRoomBalanceOut,
    SubscriptionCreate,
    SubscriptionOut,
)
from app.services.auth_user import get_or_create_user
from app.services.availability import booking_overlaps_date, subscription_overlaps
from app.services.meeting_room_balance import balance_for_period
from app.models.space import Space
from app.models.location import Location
from app.models.enums import UserAppRole, UserRole
from app.services.authz import accessible_location_ids, require_location_roles
from app.services.stripe_payments import cancel_stripe_subscription

router = APIRouter()


def _to_out(db: Session, subscription: Subscription) -> SubscriptionOut:
    space = db.query(Space).filter(Space.id == subscription.space_id).first()
    location_name = None
    space_public_id = None
    space_type = None
    if space:
        space_public_id = space.public_id
        space_type = space.space_type.value if hasattr(space.space_type, "value") else str(space.space_type)
        location = db.query(Location).filter(Location.id == space.location_id).first()
        if location:
            location_name = location.name

    plan_public_id = None
    if subscription.membership_plan_id:
        plan = (
            db.query(MembershipPlan)
            .filter(MembershipPlan.id == subscription.membership_plan_id)
            .first()
        )
        if plan:
            plan_public_id = plan.public_id

    return SubscriptionOut(
        public_id=subscription.public_id,
        space_id=subscription.space_id,
        space_public_id=space_public_id,
        space_type=space_type,
        location_name=location_name,
        status=subscription.status,
        start_date=subscription.start_date,
        end_date=subscription.end_date,
        stripe_subscription_id=subscription.stripe_subscription_id,
        booking_mode=subscription.booking_mode,
        membership_plan_public_id=plan_public_id,
        commitment_months=subscription.commitment_months,
        commitment_start_date=subscription.commitment_start_date,
        commitment_end_date=subscription.commitment_end_date,
        included_meeting_room_hours_per_month=subscription.included_meeting_room_hours_per_month or 0,
        auto_renew=subscription.auto_renew or False,
    )


@router.post("/subscriptions", response_model=SubscriptionOut)
def create_subscription(
    payload: SubscriptionCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    if subscription_overlaps(db, space.id, payload.start_date, payload.end_date):
        raise HTTPException(status_code=409, detail="Space already subscribed for that date")

    if booking_overlaps_date(db, space.id, payload.start_date, payload.end_date):
        raise HTTPException(status_code=409, detail="Space has bookings in that date range")

    subscription = Subscription(
        user_id=user.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        status="active",
        start_date=payload.start_date,
        end_date=payload.end_date
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return _to_out(db, subscription)


@router.get("/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(
    status: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(Subscription)

    if user.role == UserAppRole.CUSTOMER:
        query = query.filter(Subscription.user_id == user.id)
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
        query = query.filter(Subscription.space_id.in_(space_ids))

    if status:
        query = query.filter(Subscription.status == status)

    subscriptions = query.order_by(Subscription.created_at.desc()).all()
    return [_to_out(db, subscription) for subscription in subscriptions]


@router.get("/subscriptions/{public_id}", response_model=SubscriptionOut)
def get_subscription(
    public_id: str,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, _user)
    subscription = db.query(Subscription).filter(Subscription.public_id == public_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if user.role == UserAppRole.CUSTOMER:
        if subscription.user_id != user.id:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return _to_out(db, subscription)
    space = db.query(Space).filter(Space.id == subscription.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Subscription not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Subscription not found")
    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
        detail="Subscription not found",
        status_code=404,
    )
    return _to_out(db, subscription)


@router.get(
    "/subscriptions/{public_id}/meeting-room-balance",
    response_model=MeetingRoomBalanceOut,
)
def get_meeting_room_balance(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    subscription = (
        db.query(Subscription).filter(Subscription.public_id == public_id).first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if user.role == UserAppRole.CUSTOMER and subscription.user_id != user.id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if user.role != UserAppRole.CUSTOMER:
        space = db.query(Space).filter(Space.id == subscription.space_id).first()
        location = (
            db.query(Location).filter(Location.id == space.location_id).first()
            if space
            else None
        )
        if not space or not location:
            raise HTTPException(status_code=404, detail="Subscription not found")
        require_location_roles(
            db,
            user.id,
            location,
            {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
            detail="Subscription not found",
            status_code=404,
        )

    summary = balance_for_period(db, subscription, as_of=date_cls.today())
    overage_rate_cents = None
    if subscription.membership_plan_id:
        plan = (
            db.query(MembershipPlan)
            .filter(MembershipPlan.id == subscription.membership_plan_id)
            .first()
        )
        if plan:
            overage_rate_cents = plan.overage_hourly_rate_cents
    return MeetingRoomBalanceOut(
        period_start=summary.period_start,
        period_end=summary.period_end,
        granted_minutes=summary.granted_minutes,
        used_minutes=summary.used_minutes,
        remaining_minutes=summary.remaining_minutes,
        overage_hourly_rate_cents=overage_rate_cents,
    )


@router.post("/subscriptions/{public_id}/cancel", response_model=SubscriptionOut)
def cancel_subscription(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    subscription = db.query(Subscription).filter(Subscription.public_id == public_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if user.role == UserAppRole.CUSTOMER:
        if subscription.user_id != user.id:
            raise HTTPException(status_code=404, detail="Subscription not found")
    else:
        space = db.query(Space).filter(Space.id == subscription.space_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Subscription not found")
        location = db.query(Location).filter(Location.id == space.location_id).first()
        if not location:
            raise HTTPException(status_code=404, detail="Subscription not found")
        require_location_roles(
            db,
            user.id,
            location,
            {UserRole.OWNER, UserRole.ADMIN},
            detail="Subscription not found",
            status_code=404,
        )

    if subscription.status in {"canceled", "canceling"}:
        return _to_out(db, subscription)

    if subscription.stripe_subscription_id:
        cancel_stripe_subscription(subscription.stripe_subscription_id)

    subscription.status = "canceling" if subscription.stripe_subscription_id else "canceled"
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return _to_out(db, subscription)
