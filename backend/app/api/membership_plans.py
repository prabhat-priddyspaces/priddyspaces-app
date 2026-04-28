from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import BookingMode, LocationStatus, SpaceType, SpaceVisibility, UserRole
from app.models.location import Location
from app.models.membership_plan import MembershipPlan
from app.models.organization import Organization
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.schemas.membership_plan import (
    MembershipPlanCreate,
    MembershipPlanOut,
    MembershipPlanPublicOut,
    MembershipPlanUpdate,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import require_location_roles
from app.services.booking_modes import is_mode_valid_for_space_type
from app.services.platform_auth import organization_is_publicly_visible

router = APIRouter()


def _load_space_for_owner(
    db: Session, token: dict, space_public_id: str
) -> tuple[Space, Location]:
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Space not found")
    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})
    return space, location


def _load_plan_for_owner(
    db: Session, token: dict, plan_public_id: str
) -> tuple[MembershipPlan, Space, Location]:
    plan = (
        db.query(MembershipPlan).filter(MembershipPlan.public_id == plan_public_id).first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Membership plan not found")
    space = db.query(Space).filter(Space.id == plan.space_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
    if not space or not location:
        raise HTTPException(status_code=404, detail="Membership plan not found")
    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})
    return plan, space, location


@router.post("/membership-plans", response_model=MembershipPlanOut)
def create_membership_plan(
    payload: MembershipPlanCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    space, location = _load_space_for_owner(db, token, payload.space_public_id)

    space_type = SpaceType(space.space_type) if not isinstance(space.space_type, SpaceType) else space.space_type
    if not is_mode_valid_for_space_type(space_type, payload.booking_mode):
        raise HTTPException(
            status_code=400,
            detail=f"Booking mode {payload.booking_mode.value} is not valid for space type {space_type.value}",
        )

    plan = MembershipPlan(
        tenant_id=space.tenant_id,
        organization_id=location.organization_id,
        space_id=space.id,
        booking_mode=payload.booking_mode.value,
        name=payload.name,
        description=payload.description,
        price_cents=payload.price_cents,
        billing_cycle=payload.billing_cycle.value,
        commitment_months=payload.commitment_months,
        auto_renew=payload.auto_renew,
        included_meeting_room_hours_per_month=payload.included_meeting_room_hours_per_month,
        overage_hourly_rate_cents=payload.overage_hourly_rate_cents,
        seats_per_plan=payload.seats_per_plan,
        max_active_subscriptions=payload.max_active_subscriptions,
        is_active=payload.is_active,
        sort_order=payload.sort_order,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/membership-plans", response_model=list[MembershipPlanOut])
def list_membership_plans(
    space_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    space, _ = _load_space_for_owner(db, token, space_public_id)
    plans = (
        db.query(MembershipPlan)
        .filter(MembershipPlan.space_id == space.id)
        .order_by(MembershipPlan.sort_order.asc(), MembershipPlan.created_at.asc())
        .all()
    )
    return plans


@router.get("/membership-plans/public", response_model=list[MembershipPlanPublicOut])
def list_public_membership_plans(
    space_public_id: str,
    booking_mode: BookingMode | None = None,
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    if (
        not location
        or location.status != LocationStatus.ACTIVE
        or not organization_is_publicly_visible(organization)
        or space.visibility == SpaceVisibility.PRIVATE
    ):
        raise HTTPException(status_code=404, detail="Space not found")

    enabled_modes = {
        row.booking_mode
        for row in db.query(SpaceBookingMode)
        .filter(
            SpaceBookingMode.space_id == space.id,
            SpaceBookingMode.is_enabled.is_(True),
        )
        .all()
    }

    query = (
        db.query(MembershipPlan)
        .filter(
            MembershipPlan.space_id == space.id,
            MembershipPlan.is_active.is_(True),
        )
    )
    if booking_mode is not None:
        if booking_mode.value not in enabled_modes:
            return []
        query = query.filter(MembershipPlan.booking_mode == booking_mode.value)
    elif enabled_modes:
        query = query.filter(MembershipPlan.booking_mode.in_(enabled_modes))
    else:
        return []

    plans = query.order_by(
        MembershipPlan.sort_order.asc(), MembershipPlan.price_cents.asc()
    ).all()
    return plans


@router.get("/membership-plans/{public_id}", response_model=MembershipPlanOut)
def get_membership_plan(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    plan, _, _ = _load_plan_for_owner(db, token, public_id)
    return plan


@router.patch("/membership-plans/{public_id}", response_model=MembershipPlanOut)
def update_membership_plan(
    public_id: str,
    payload: MembershipPlanUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    plan, _, _ = _load_plan_for_owner(db, token, public_id)

    price_changed = (
        payload.price_cents is not None and payload.price_cents != plan.price_cents
    )

    for field, value in payload.model_dump(exclude_unset=True).items():
        if hasattr(value, "value"):
            value = value.value
        setattr(plan, field, value)

    # Stripe Prices are immutable; clear the linked id so a new one is created on next purchase.
    if price_changed:
        plan.stripe_price_id = None

    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/membership-plans/{public_id}", response_model=MembershipPlanOut)
def deactivate_membership_plan(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    plan, _, _ = _load_plan_for_owner(db, token, public_id)
    plan.is_active = False
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan
