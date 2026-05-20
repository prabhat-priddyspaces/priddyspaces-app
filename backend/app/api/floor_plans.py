from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.floor_plan import FloorPlan
from app.models.location import Location
from app.schemas.floor_plan import FloorPlanCreate, FloorPlanOut, FloorPlanPresignIn, FloorPlanPresignOut
from app.services.lookups import get_location_by_public_id
from app.services.storage import presign_floor_plan_upload, public_floor_plan_url
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin

router = APIRouter()


@router.post("/floor-plans/presign", response_model=FloorPlanPresignOut)
def presign_floor_plan(
    payload: FloorPlanPresignIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    location = get_location_by_public_id(db, payload.location_public_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, location.organization_id, user.id)
    require_owner_or_admin(member)
    return presign_floor_plan_upload(payload.filename, payload.content_type, payload.size_bytes)


@router.post("/floor-plans", response_model=FloorPlanOut)
def create_floor_plan(
    payload: FloorPlanCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    location = get_location_by_public_id(db, payload.location_public_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, location.organization_id, user.id)
    require_owner_or_admin(member)

    version = payload.version or 1
    floor_plan = FloorPlan(
        location_id=location.id,
        tenant_id=location.organization_id,
        image_url=public_floor_plan_url(payload.image_url) if payload.image_url.startswith("floor-plans/") else payload.image_url,
        scale=payload.scale,
        version=version
    )
    db.add(floor_plan)
    db.commit()
    db.refresh(floor_plan)
    return floor_plan


@router.get("/floor-plans/{public_id}", response_model=FloorPlanOut)
def get_floor_plan(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    floor_plan = db.query(FloorPlan).filter(FloorPlan.public_id == public_id).first()
    if not floor_plan:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    location = db.query(Location).filter(Location.id == floor_plan.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, location.organization_id, user.id)
    require_owner_or_admin(member)
    return floor_plan


@router.get("/locations/{location_public_id}/floor-plans", response_model=list[FloorPlanOut])
def list_floor_plans(
    location_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    location = get_location_by_public_id(db, location_public_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, location.organization_id, user.id)
    require_owner_or_admin(member)
    return db.query(FloorPlan).filter(FloorPlan.location_id == location.id).all()
