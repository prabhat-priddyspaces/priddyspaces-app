from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user
from app.db.deps import get_db
from app.models.enums import LocationStatus, SpaceVisibility, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.models.space_setup_fee_item import SpaceSetupFeeItem
from app.schemas.space_setup_fee import SetupFeeItemOut, SetupFeeReplaceIn
from app.services.auth_user import get_or_create_user
from app.services.authz import require_location_roles
from app.services.platform_auth import organization_is_publicly_visible
from app.services.setup_fees import add_normalized_setup_fee_items, normalize_setup_fee_items


router = APIRouter()


def _load_space(db: Session, public_id: str) -> Space:
    space = db.query(Space).filter(Space.public_id == public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return space


@router.get("/spaces/{space_public_id}/setup-fees", response_model=list[SetupFeeItemOut])
def list_setup_fees(
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
            db,
            user.id,
            location,
            {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
            detail="Space not found",
            status_code=404,
        )

    rows = (
        db.query(SpaceSetupFeeItem)
        .filter(SpaceSetupFeeItem.space_id == space.id)
        .order_by(SpaceSetupFeeItem.sort_order.asc(), SpaceSetupFeeItem.id.asc())
        .all()
    )
    return rows


@router.put("/spaces/{space_public_id}/setup-fees", response_model=list[SetupFeeItemOut])
def replace_setup_fees(
    space_public_id: str,
    payload: SetupFeeReplaceIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    space = _load_space(db, space_public_id)
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Space not found")
    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})

    try:
        setup_fee_items = normalize_setup_fee_items(payload.items)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.query(SpaceSetupFeeItem).filter(SpaceSetupFeeItem.space_id == space.id).delete()
    add_normalized_setup_fee_items(
        db,
        tenant_id=space.tenant_id,
        space_id=space.id,
        items=setup_fee_items,
    )
    db.commit()
    return list_setup_fees(space_public_id, db, token)
