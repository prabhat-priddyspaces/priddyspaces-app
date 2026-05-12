from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user
from app.db.deps import get_db
from app.models.enums import LocationStatus, UserAppRole, UserRole, SpaceVisibility
from app.models.organization import Organization
from app.models.space import Space
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
from app.services.platform_auth import get_audit_actor_context, organization_is_publicly_visible

router = APIRouter()


def _space_display_name(raw_name: str | None, space_type: str) -> str:
    cleaned = (raw_name or "").strip()
    if cleaned:
        return cleaned
    return " ".join(part.capitalize() for part in space_type.split("_"))


def _serialize_space(
    space: Space,
    *,
    location_amenities_text: str | None = None,
) -> SpaceOut:
    return SpaceOut(
        public_id=space.public_id,
        name=_space_display_name(space.name, space.space_type.value),
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
        amenities=location_amenities_text or space.amenities,
    )


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

    space = Space(
        location_id=location.id,
        tenant_id=location.organization_id,
        name=_space_display_name(payload.name, payload.space_type.value),
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
        amenities=payload.amenities
    )
    db.add(space)
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

    if _space_publicly_visible(space, location, organization):
        return _serialize_space(space, location_amenities_text=amenity_text)

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
    return _serialize_space(space, location_amenities_text=amenity_text)


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
        space.space_type = payload.space_type
    if payload.name is not None:
        next_type = payload.space_type.value if payload.space_type is not None else space.space_type.value
        space.name = _space_display_name(payload.name, next_type)
    if payload.capacity is not None:
        space.capacity = payload.capacity
    if payload.price_monthly is not None:
        space.price_monthly = payload.price_monthly
    if payload.price_daily is not None:
        space.price_daily = payload.price_daily
    if payload.price_hourly is not None:
        space.price_hourly = payload.price_hourly
    if payload.availability_status is not None:
        space.availability_status = payload.availability_status
    if payload.availability_start_time is not None:
        space.availability_start_time = payload.availability_start_time
    if payload.availability_end_time is not None:
        space.availability_end_time = payload.availability_end_time
    if payload.buffer_before_minutes is not None:
        space.buffer_before_minutes = payload.buffer_before_minutes
    if payload.buffer_after_minutes is not None:
        space.buffer_after_minutes = payload.buffer_after_minutes
    if payload.visibility is not None:
        space.visibility = payload.visibility
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
    if user.role == UserAppRole.CUSTOMER:
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
        return [_serialize_space(space, location_amenities_text=amenity_text) for space in spaces]
    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
    )
    spaces = db.query(Space).filter(Space.location_id == location.id).all()
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
    return [_serialize_space(space, location_amenities_text=amenity_text) for space in spaces]


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
        "price_monthly": space.price_monthly,
        "price_daily": space.price_daily
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
        after_state={"price_monthly": space.price_monthly, "price_daily": space.price_daily},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    location_amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    amenity_text = ", ".join(str(item["name"]) for item in location_amenities) if location_amenities else None
    return _serialize_space(space, location_amenities_text=amenity_text)
