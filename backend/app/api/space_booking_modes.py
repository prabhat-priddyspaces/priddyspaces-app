from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import UserRole
from app.models.location import Location
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.schemas.space_booking_mode import SpaceBookingModeOut, SpaceBookingModeUpsert
from app.services.auth_user import get_or_create_user
from app.services.authz import require_location_roles
from app.services.booking_modes import is_mode_valid_for_space_type

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


@router.get(
    "/spaces/{space_public_id}/booking-modes",
    response_model=list[SpaceBookingModeOut],
)
def list_space_booking_modes(
    space_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    space, _ = _load_space_for_owner(db, token, space_public_id)
    rows = (
        db.query(SpaceBookingMode)
        .filter(SpaceBookingMode.space_id == space.id)
        .order_by(SpaceBookingMode.created_at.asc())
        .all()
    )
    return rows


@router.put(
    "/spaces/{space_public_id}/booking-modes",
    response_model=SpaceBookingModeOut,
)
def upsert_space_booking_mode(
    space_public_id: str,
    payload: SpaceBookingModeUpsert,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    space, _ = _load_space_for_owner(db, token, space_public_id)

    if not is_mode_valid_for_space_type(space.space_type, payload.booking_mode, db=db):
        raise HTTPException(
            status_code=400,
            detail=f"Booking mode {payload.booking_mode.value} is not valid for space type {space.space_type}",
        )

    existing = (
        db.query(SpaceBookingMode)
        .filter(
            SpaceBookingMode.space_id == space.id,
            SpaceBookingMode.booking_mode == payload.booking_mode.value,
        )
        .first()
    )
    if existing:
        existing.is_enabled = payload.is_enabled
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    row = SpaceBookingMode(
        tenant_id=space.tenant_id,
        space_id=space.id,
        booking_mode=payload.booking_mode.value,
        is_enabled=payload.is_enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
