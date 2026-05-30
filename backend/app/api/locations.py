from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import LocationStatus, OrganizationReviewStatus, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.schemas.location import LocationCreate, LocationOut, LocationUpdate
from app.schemas.working_hours import (
    effective_public_working_hours,
    parse_legacy_public_hours,
    validate_public_working_hours,
)
from app.services.amenities import get_location_amenities_map, sync_location_amenities
from app.services.lookups import get_org_by_public_id
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, get_org_member, require_location_roles, require_owner_or_admin
from app.services.platform_auth import organization_is_publicly_visible

router = APIRouter()


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _working_hours_to_dicts(value):
    if value is None:
        return None
    return [item.model_dump() if hasattr(item, "model_dump") else dict(item) for item in value]


def _validate_working_hours_or_422(enabled: bool, value) -> list[dict[str, object]]:
    try:
        return validate_public_working_hours(enabled, value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _create_working_hours(payload: LocationCreate) -> tuple[bool, list[dict[str, object]]]:
    incoming_hours = _working_hours_to_dicts(payload.public_working_hours)
    enabled = bool(payload.public_working_hours_enabled)
    if incoming_hours is not None:
        return enabled, _validate_working_hours_or_422(enabled, incoming_hours)

    parsed_enabled, parsed_hours = parse_legacy_public_hours(
        payload.public_hours_weekdays,
        payload.public_hours_weekends,
    )
    if parsed_enabled:
        enabled = payload.public_working_hours_enabled or parsed_enabled
        return enabled, _validate_working_hours_or_422(enabled, parsed_hours)

    return enabled, _validate_working_hours_or_422(enabled, [])


def _apply_working_hours_update(location: Location, payload: LocationUpdate) -> None:
    hours_fields_changed = (
        payload.public_working_hours_enabled is not None
        or payload.public_working_hours is not None
        or payload.public_hours_weekdays is not None
        or payload.public_hours_weekends is not None
    )
    if not hours_fields_changed:
        return

    enabled = (
        bool(payload.public_working_hours_enabled)
        if payload.public_working_hours_enabled is not None
        else bool(location.public_working_hours_enabled)
    )
    incoming_hours = _working_hours_to_dicts(payload.public_working_hours)
    if incoming_hours is None:
        if location.public_working_hours:
            incoming_hours = location.public_working_hours
        else:
            parsed_enabled, parsed_hours = parse_legacy_public_hours(
                location.public_hours_weekdays,
                location.public_hours_weekends,
            )
            if payload.public_working_hours_enabled is None:
                enabled = parsed_enabled
            incoming_hours = parsed_hours

    location.public_working_hours_enabled = enabled
    location.public_working_hours = _validate_working_hours_or_422(enabled, incoming_hours)


def _serialize_location(
    location: Location,
    organization_public_id: str,
    organization_name: str | None = None,
    amenities: list[dict[str, int | str | None]] | None = None,
) -> LocationOut:
    working_hours_enabled, working_hours = effective_public_working_hours(
        enabled=location.public_working_hours_enabled,
        hours=location.public_working_hours,
        legacy_weekdays=location.public_hours_weekdays,
        legacy_weekends=location.public_hours_weekends,
    )
    return LocationOut(
        public_id=location.public_id,
        organization_public_id=organization_public_id,
        organization_name=organization_name,
        name=location.name,
        address=location.address,
        city=location.city,
        state=location.state,
        postal_code=location.postal_code,
        neighborhood=location.neighborhood,
        timezone=location.timezone,
        lat=location.lat,
        lng=location.lng,
        public_phone=location.public_phone,
        public_email=location.public_email,
        public_hours_weekdays=location.public_hours_weekdays,
        public_hours_weekends=location.public_hours_weekends,
        public_working_hours_enabled=working_hours_enabled,
        public_working_hours=working_hours,
        public_parking_notes=location.public_parking_notes,
        public_transit_notes=location.public_transit_notes,
        public_included_items=location.public_included_items,
        status=location.status,
        booking_granularity=location.booking_granularity,
        amenities=amenities or [],
    )


@router.post("/locations", response_model=LocationOut)
def create_location(
    payload: LocationCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = get_org_by_public_id(db, payload.organization_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    working_hours_enabled, working_hours = _create_working_hours(payload)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name=payload.name,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        postal_code=payload.postal_code,
        neighborhood=payload.neighborhood,
        timezone=payload.timezone,
        lat=payload.lat,
        lng=payload.lng,
        public_phone=_clean_optional_text(payload.public_phone),
        public_email=_clean_optional_text(payload.public_email),
        public_hours_weekdays=_clean_optional_text(payload.public_hours_weekdays),
        public_hours_weekends=_clean_optional_text(payload.public_hours_weekends),
        public_working_hours_enabled=working_hours_enabled,
        public_working_hours=working_hours,
        public_parking_notes=_clean_optional_text(payload.public_parking_notes),
        public_transit_notes=_clean_optional_text(payload.public_transit_notes),
        public_included_items=_clean_optional_text(payload.public_included_items),
        booking_granularity=payload.booking_granularity
    )
    db.add(location)
    db.flush()
    sync_location_amenities(
        db,
        organization_id=org.id,
        location_id=location.id,
        amenity_ids=payload.amenity_ids,
    )
    db.commit()
    db.refresh(location)
    amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    return _serialize_location(location, org.public_id, org.name, amenities)


@router.get("/locations/{public_id}", response_model=LocationOut)
def get_location(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    location = db.query(Location).filter(Location.public_id == public_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    org = db.query(Organization).filter(Organization.id == location.organization_id).first()
    if user.role == UserAppRole.MEMBER:
        if location.status != LocationStatus.ACTIVE or not organization_is_publicly_visible(org):
            raise HTTPException(status_code=404, detail="Location not found")
    if user.role != UserAppRole.MEMBER:
        require_location_roles(
            db,
            user.id,
            location,
            {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
            detail="Location not found",
            status_code=404,
        )
    org_public_id = org.public_id if org else ""
    amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    return _serialize_location(location, org_public_id, org.name if org else None, amenities)


@router.patch("/locations/{public_id}", response_model=LocationOut)
def update_location(
    public_id: str,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    location = db.query(Location).filter(Location.public_id == public_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})

    if payload.name is not None:
        location.name = payload.name
    if payload.address is not None:
        location.address = payload.address
    if payload.city is not None:
        location.city = payload.city
    if payload.state is not None:
        location.state = payload.state
    if payload.postal_code is not None:
        location.postal_code = payload.postal_code
    if payload.neighborhood is not None:
        location.neighborhood = payload.neighborhood
    if payload.timezone is not None:
        location.timezone = payload.timezone
    if payload.lat is not None:
        location.lat = payload.lat
    if payload.lng is not None:
        location.lng = payload.lng
    if payload.public_phone is not None:
        location.public_phone = _clean_optional_text(payload.public_phone)
    if payload.public_email is not None:
        location.public_email = _clean_optional_text(payload.public_email)
    if payload.public_hours_weekdays is not None:
        location.public_hours_weekdays = _clean_optional_text(payload.public_hours_weekdays)
    if payload.public_hours_weekends is not None:
        location.public_hours_weekends = _clean_optional_text(payload.public_hours_weekends)
    _apply_working_hours_update(location, payload)
    if payload.public_parking_notes is not None:
        location.public_parking_notes = _clean_optional_text(payload.public_parking_notes)
    if payload.public_transit_notes is not None:
        location.public_transit_notes = _clean_optional_text(payload.public_transit_notes)
    if payload.public_included_items is not None:
        location.public_included_items = _clean_optional_text(payload.public_included_items)
    if payload.booking_granularity is not None:
        location.booking_granularity = payload.booking_granularity
    if payload.status is not None:
        location.status = payload.status
    if payload.amenity_ids is not None:
        sync_location_amenities(
            db,
            organization_id=location.organization_id,
            location_id=location.id,
            amenity_ids=payload.amenity_ids,
        )

    db.add(location)
    db.commit()
    db.refresh(location)
    org = db.query(Organization).filter(Organization.id == location.organization_id).first()
    org_public_id = org.public_id if org else ""
    amenities = get_location_amenities_map(db, [location.id]).get(location.id, [])
    return _serialize_location(location, org_public_id, org.name if org else None, amenities)


@router.get("/locations", response_model=list[LocationOut])
def list_locations(
    organization_public_id: str | None = None,
    city: str | None = None,
    status: LocationStatus | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(Location)

    if user.role == UserAppRole.MEMBER:
        query = query.join(Organization, Organization.id == Location.organization_id).filter(
            Location.status == LocationStatus.ACTIVE,
            Organization.review_status == OrganizationReviewStatus.APPROVED,
        )
        if city:
            query = query.filter(Location.city == city)
    else:
        location_ids = accessible_location_ids(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
        if not location_ids:
            return []
        query = query.filter(Location.id.in_(location_ids))
        if organization_public_id:
            org = get_org_by_public_id(db, organization_public_id)
            if not org:
                return []
            query = query.filter(Location.organization_id == org.id)
        if status is not None:
            query = query.filter(Location.status == status)

    locations = query.all()
    if not locations:
        return []
    organization_map = {
        org.id: (org.public_id, org.name)
        for org in db.query(Organization).filter(
            Organization.id.in_({location.organization_id for location in locations})
        ).all()
    }
    amenity_map = get_location_amenities_map(db, [location.id for location in locations])
    return [
        _serialize_location(
            location,
            organization_map.get(location.organization_id, ("", None))[0],
            organization_map.get(location.organization_id, ("", None))[1],
            amenity_map.get(location.id, []),
        )
        for location in locations
    ]
