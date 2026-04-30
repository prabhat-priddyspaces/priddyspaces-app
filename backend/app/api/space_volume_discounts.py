from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user
from app.db.deps import get_db
from app.models.enums import LocationStatus, SpaceVisibility, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.models.space_volume_discount import SpaceVolumeDiscount
from app.schemas.space_volume_discount import (
    VolumeDiscountReplaceIn,
    VolumeDiscountTier,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import require_location_roles
from app.services.platform_auth import organization_is_publicly_visible


router = APIRouter()


def _load_space(db: Session, public_id: str) -> Space:
    space = db.query(Space).filter(Space.public_id == public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return space


@router.get("/spaces/{space_public_id}/volume-discounts", response_model=list[VolumeDiscountTier])
def list_volume_discounts(
    space_public_id: str,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    space = _load_space(db, space_public_id)
    location = db.query(Location).filter(Location.id == space.location_id).first()
    organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    publicly_visible = bool(
        location
        and location.status == LocationStatus.ACTIVE
        and organization_is_publicly_visible(organization)
        and space.visibility != SpaceVisibility.PRIVATE
    )
    if not publicly_visible:
        if token is None or not location:
            raise HTTPException(status_code=404, detail="Space not found")
        user = get_or_create_user(db, token)
        require_location_roles(
            db, user.id, location,
            {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
            detail="Space not found", status_code=404,
        )
    rows = (
        db.query(SpaceVolumeDiscount)
        .filter(SpaceVolumeDiscount.space_id == space.id)
        .order_by(SpaceVolumeDiscount.min_hours.asc())
        .all()
    )
    return [
        VolumeDiscountTier(
            public_id=row.public_id,
            min_hours=row.min_hours,
            discount_percent=row.discount_percent,
            is_active=row.is_active,
        )
        for row in rows
    ]


@router.put("/spaces/{space_public_id}/volume-discounts", response_model=list[VolumeDiscountTier])
def replace_volume_discounts(
    space_public_id: str,
    payload: VolumeDiscountReplaceIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    space = _load_space(db, space_public_id)
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Space not found")
    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})

    # Reject duplicate min_hours within the same payload — owners shouldn't be able
    # to set two competing tiers at the same threshold.
    seen: set[float] = set()
    for tier in payload.tiers:
        if tier.min_hours in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate min_hours: {tier.min_hours}")
        seen.add(tier.min_hours)

    db.query(SpaceVolumeDiscount).filter(SpaceVolumeDiscount.space_id == space.id).delete()
    for tier in payload.tiers:
        db.add(
            SpaceVolumeDiscount(
                organization_id=space.tenant_id,
                tenant_id=space.tenant_id,
                space_id=space.id,
                min_hours=tier.min_hours,
                discount_percent=tier.discount_percent,
                is_active=tier.is_active,
            )
        )
    db.commit()
    return list_volume_discounts(space_public_id, db, token)
