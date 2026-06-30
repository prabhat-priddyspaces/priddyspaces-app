from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user
from app.db.deps import get_db
from app.models.enums import LocationStatus, UserAppRole, UserRole, SpaceVisibility
from app.models.membership_plan import MembershipPlan
from app.models.organization import Organization
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.space_image import SpaceImage
from app.models.space_setup_fee_item import SpaceSetupFeeItem
from app.models.space_volume_discount import SpaceVolumeDiscount
from app.schemas.space import SpaceCreate, SpaceOut, SpaceUpdate
from app.schemas.space_override import SpacePriceOverride
from app.services.amenities import get_location_amenities_map
from app.services.auth_user import get_or_create_user
from app.services.authz import (
    get_org_member,
    require_location_roles,
    require_pricing_override,
)
from app.services.audit import write_audit_log
from app.models.location import Location
from app.services.lookups import get_location_by_public_id
from app.services.owner_payments import space_payment_is_marketplace_ready
from app.services.platform_auth import get_audit_actor_context, organization_is_publicly_visible
from app.services.setup_fees import add_normalized_setup_fee_items, normalize_setup_fee_items
from app.services.space_archetypes import DEFAULT_DIRECT_MODE_BY_ARCHETYPE
from app.services.space_type_registry import resolve_archetype, space_type_is_enabled

router = APIRouter()


def _require_enabled_space_type(db: Session, key: str) -> None:
    if not space_type_is_enabled(db, key):
        raise HTTPException(status_code=400, detail=f"Unknown or disabled space type: {key}")


def _space_display_name(raw_name: str | None, space_type: str) -> str:
    cleaned = (raw_name or "").strip()
    if cleaned:
        return cleaned
    return " ".join(part.capitalize() for part in space_type.split("_"))


def _serialize_space(
    space: Space,
    *,
    organization_name: str | None = None,
    organization: Organization | None = None,
    location_amenities_text: str | None = None,
) -> SpaceOut:
    org_name = organization_name or (organization.name if organization else None)
    return SpaceOut(
        public_id=space.public_id,
        organization_name=org_name,
        booking_approval_mode=(organization.booking_approval_mode if organization else "manual") or "manual",
        membership_lease_approval_mode=(
            organization.membership_lease_approval_mode if organization else "manual"
        )
        or "manual",
        payment_failure_hold_minutes=organization.payment_failure_hold_minutes if organization else None,
        name=_space_display_name(space.name, space.space_type),
        space_type=space.space_type,
        capacity=space.capacity,
        price_monthly=space.price_monthly,
        price_daily=space.price_daily,
        price_hourly=space.price_hourly,
        availability_status=space.availability_status,
        availability_start_time=space.availability_start_time,
        availability_end_time=space.availability_end_time,
        buffer_before_minutes=space.buffer_before_minutes or 0,
        buffer_after_minutes=space.buffer_after_minutes or 0,
        visibility=space.visibility,
        priddy_points_enabled=space.priddy_points_enabled,
        owner_points_enabled=space.owner_points_enabled,
        amenities=location_amenities_text or space.amenities,
    )


def _audit_money(value):
    return str(value) if value is not None else None


def _space_publicly_visible(
    space: Space,
    location: Location | None,
    organization: Organization | None,
) -> bool:
    return bool(
        location
        and location.status == LocationStatus.ACTIVE
        and organization_is_publicly_visible(organization)
        and space.visibility != SpaceVisibility.PRIVATE
    )


@router.post("/spaces", response_model=SpaceOut)
def create_space(
    payload: SpaceCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    location = get_location_by_public_id(db, payload.location_public_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})
    _require_enabled_space_type(db, payload.space_type)
    try:
        setup_fee_items = normalize_setup_fee_items(payload.setup_fee_items)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    space = Space(
        location_id=location.id,
        tenant_id=location.organization_id,
        name=_space_display_name(payload.name, payload.space_type),
        space_type=payload.space_type,
        capacity=payload.capacity,
        price_monthly=payload.price_monthly,
        price_daily=payload.price_daily,
        price_hourly=payload.price_hourly,
        availability_start_time=payload.availability_start_time,
        availability_end_time=payload.availability_end_time,
        buffer_before_minutes=payload.buffer_before_minutes,
        buffer_after_minutes=payload.buffer_after_minutes,
        visibility=payload.visibility,
        priddy_points_enabled=payload.priddy_points_enabled,
        owner_points_enabled=payload.owner_points_enabled,
        amenities=payload.amenities
    )
    db.add(space)
    db.flush()
    default_archetype = resolve_archetype(db, space.space_type)
    default_mode_enum = DEFAULT_DIRECT_MODE_BY_ARCHETYPE.get(default_archetype)
    if default_mode_enum:
        db.add(
            SpaceBookingMode(
                tenant_id=location.organization_id,
                space_id=space.id,
                booking_mode=default_mode_enum.value,
                is_enabled=True,
            )
        )
    add_normalized_setup_fee_items(
        db,
        tenant_id=location.organization_id,
        space_id=space.id,
        items=setup_fee_items,
    )
    db.commit()
    db.refresh(space)
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
    return _serialize_space(space, location_amenities_text=amenity_text)


@router.get("/spaces/{public_id}", response_model=SpaceOut)
def get_space(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user)
):
    space = db.query(Space).filter(Space.public_id == public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, []) if location else []
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None

    if _space_publicly_visible(space, location, organization) and space_payment_is_marketplace_ready(db, space):
        return _serialize_space(
            space,
            organization=organization,
            location_amenities_text=amenity_text,
        )

    if token is None:
        raise HTTPException(status_code=404, detail="Space not found")

    user = get_or_create_user(db, token)
    if not location:
        raise HTTPException(status_code=404, detail="Space not found")
    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
        detail="Space not found",
        status_code=404,
    )
    return _serialize_space(
        space,
        organization=organization,
        location_amenities_text=amenity_text,
    )


@router.post("/spaces/{public_id}/duplicate", response_model=SpaceOut)
def duplicate_space(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    source = db.query(Space).filter(Space.public_id == public_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == source.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})

    duplicate = Space(
        location_id=source.location_id,
        tenant_id=source.tenant_id,
        name=f"COPY of {_space_display_name(source.name, source.space_type)}",
        space_type=source.space_type,
        capacity=source.capacity,
        price_monthly=source.price_monthly,
        price_daily=source.price_daily,
        price_hourly=source.price_hourly,
        availability_status=source.availability_status,
        availability_start_time=source.availability_start_time,
        availability_end_time=source.availability_end_time,
        buffer_before_minutes=source.buffer_before_minutes,
        buffer_after_minutes=source.buffer_after_minutes,
        visibility=source.visibility,
        priddy_points_enabled=source.priddy_points_enabled,
        owner_points_enabled=source.owner_points_enabled,
        amenities=source.amenities,
    )
    db.add(duplicate)
    db.flush()

    for mode in db.query(SpaceBookingMode).filter(SpaceBookingMode.space_id == source.id).all():
        db.add(
            SpaceBookingMode(
                tenant_id=mode.tenant_id,
                space_id=duplicate.id,
                booking_mode=mode.booking_mode,
                is_enabled=mode.is_enabled,
            )
        )

    for plan in db.query(MembershipPlan).filter(MembershipPlan.space_id == source.id).all():
        db.add(
            MembershipPlan(
                tenant_id=plan.tenant_id,
                organization_id=plan.organization_id,
                space_id=duplicate.id,
                booking_mode=plan.booking_mode,
                name=plan.name,
                description=plan.description,
                price_cents=plan.price_cents,
                billing_cycle=plan.billing_cycle,
                stripe_price_id=plan.stripe_price_id,
                commitment_months=plan.commitment_months,
                auto_renew=plan.auto_renew,
                included_meeting_room_hours_per_month=plan.included_meeting_room_hours_per_month,
                overage_hourly_rate_cents=plan.overage_hourly_rate_cents,
                seats_per_plan=plan.seats_per_plan,
                max_active_subscriptions=plan.max_active_subscriptions,
                is_active=plan.is_active,
                sort_order=plan.sort_order,
            )
        )

    for discount in db.query(SpaceVolumeDiscount).filter(SpaceVolumeDiscount.space_id == source.id).all():
        db.add(
            SpaceVolumeDiscount(
                organization_id=discount.organization_id,
                tenant_id=discount.tenant_id,
                space_id=duplicate.id,
                min_hours=discount.min_hours,
                discount_percent=discount.discount_percent,
                is_active=discount.is_active,
            )
        )

    for setup_fee in db.query(SpaceSetupFeeItem).filter(SpaceSetupFeeItem.space_id == source.id).all():
        db.add(
            SpaceSetupFeeItem(
                tenant_id=setup_fee.tenant_id,
                space_id=duplicate.id,
                label=setup_fee.label,
                amount_cents=setup_fee.amount_cents,
                is_active=setup_fee.is_active,
                sort_order=setup_fee.sort_order,
            )
        )

    for image in db.query(SpaceImage).filter(SpaceImage.space_id == source.id).all():
        db.add(
            SpaceImage(
                tenant_id=image.tenant_id,
                space_id=duplicate.id,
                image_url=image.image_url,
                storage_key=image.storage_key,
                is_primary=image.is_primary,
                sort_order=image.sort_order,
            )
        )

    db.commit()
    db.refresh(duplicate)
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
    organization = db.query(Organization).filter(Organization.id == duplicate.tenant_id).first()
    return _serialize_space(duplicate, organization=organization, location_amenities_text=amenity_text)


@router.patch("/spaces/{public_id}", response_model=SpaceOut)
def update_space(
    public_id: str,
    payload: SpaceUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    space = db.query(Space).filter(Space.public_id == public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})

    if payload.space_type is not None:
        _require_enabled_space_type(db, payload.space_type)
        space.space_type = payload.space_type
    if payload.name is not None:
        next_type = payload.space_type if payload.space_type is not None else space.space_type
        space.name = _space_display_name(payload.name, next_type)
    if payload.capacity is not None:
        space.capacity = payload.capacity
    if "price_monthly" in payload.model_fields_set:
        space.price_monthly = payload.price_monthly
    if "price_daily" in payload.model_fields_set:
        space.price_daily = payload.price_daily
    if "price_hourly" in payload.model_fields_set:
        space.price_hourly = payload.price_hourly
    if payload.availability_status is not None:
        space.availability_status = payload.availability_status
    if "availability_start_time" in payload.model_fields_set:
        space.availability_start_time = payload.availability_start_time
    if "availability_end_time" in payload.model_fields_set:
        space.availability_end_time = payload.availability_end_time
    if payload.buffer_before_minutes is not None:
        space.buffer_before_minutes = payload.buffer_before_minutes
    if payload.buffer_after_minutes is not None:
        space.buffer_after_minutes = payload.buffer_after_minutes
    if payload.visibility is not None:
        space.visibility = payload.visibility
    if "priddy_points_enabled" in payload.model_fields_set:
        space.priddy_points_enabled = payload.priddy_points_enabled
    if "owner_points_enabled" in payload.model_fields_set:
        space.owner_points_enabled = payload.owner_points_enabled
    if payload.amenities is not None:
        space.amenities = payload.amenities

    db.add(space)
    db.commit()
    db.refresh(space)
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
    return _serialize_space(space, location_amenities_text=amenity_text)


@router.get("/locations/{location_public_id}/spaces", response_model=list[SpaceOut])
def list_spaces(
    location_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    location = get_location_by_public_id(db, location_public_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    user = get_or_create_user(db, token)
    if user.role == UserAppRole.MEMBER:
        organization = db.query(Organization).filter(Organization.id == location.organization_id).first()
        if location.status != LocationStatus.ACTIVE or not organization_is_publicly_visible(organization):
            raise HTTPException(status_code=404, detail="Location not found")
        spaces = (
            db.query(Space)
            .filter(Space.location_id == location.id, Space.visibility != SpaceVisibility.PRIVATE)
            .all()
        )
        location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
        amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
        return [_serialize_space(space, organization=organization, location_amenities_text=amenity_text) for space in spaces]
    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
    )
    spaces = db.query(Space).filter(Space.location_id == location.id).all()
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
    organization = db.query(Organization).filter(Organization.id == location.organization_id).first()
    return [_serialize_space(space, organization=organization, location_amenities_text=amenity_text) for space in spaces]


@router.patch("/spaces/{public_id}/override-price", response_model=SpaceOut)
def override_space_price(
    public_id: str,
    payload: SpacePriceOverride,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    space = db.query(Space).filter(Space.public_id == public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, location.organization_id, user.id)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})
    require_pricing_override(member)

    before = {
        "price_monthly": _audit_money(space.price_monthly),
        "price_daily": _audit_money(space.price_daily)
    }
    if payload.price_monthly is not None:
        space.price_monthly = payload.price_monthly
    if payload.price_daily is not None:
        space.price_daily = payload.price_daily

    db.add(space)
    db.commit()
    db.refresh(space)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)

    write_audit_log(
        db=db,
        actor_id=actor_id,
        action=f"override_price: {payload.reason}",
        entity_type="space",
        entity_public_id=space.public_id,
        before_state=before,
        after_state={
            "price_monthly": _audit_money(space.price_monthly),
            "price_daily": _audit_money(space.price_daily),
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
    return _serialize_space(space, location_amenities_text=amenity_text)
