from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.floor_plan import FloorPlan
from app.models.floor_plan_marker import FloorPlanMarker
from app.models.space import Space
from app.schemas.floor_plan_marker import FloorPlanMarkerCreate, FloorPlanMarkerOut
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin
from app.models.location import Location

router = APIRouter()


@router.post("/floor-plan-markers", response_model=FloorPlanMarkerOut)
def create_marker(
    payload: FloorPlanMarkerCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    floor_plan = db.query(FloorPlan).filter(FloorPlan.public_id == payload.floor_plan_public_id).first()
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")

    location = db.query(Location).filter(Location.id == floor_plan.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, location.organization_id, user.id)
    require_owner_or_admin(member)

    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    marker = FloorPlanMarker(
        floor_plan_id=floor_plan.id,
        space_id=space.id,
        tenant_id=location.organization_id,
        x_coordinate=payload.x_coordinate,
        y_coordinate=payload.y_coordinate,
        width=payload.width,
        height=payload.height
    )
    db.add(marker)
    db.commit()
    db.refresh(marker)
    return marker


@router.get("/floor-plans/{floor_plan_public_id}/markers", response_model=list[FloorPlanMarkerOut])
def list_markers(
    floor_plan_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    floor_plan = db.query(FloorPlan).filter(FloorPlan.public_id == floor_plan_public_id).first()
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")

    location = db.query(Location).filter(Location.id == floor_plan.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, location.organization_id, user.id)
    require_owner_or_admin(member)
    return db.query(FloorPlanMarker).filter(FloorPlanMarker.floor_plan_id == floor_plan.id).all()
