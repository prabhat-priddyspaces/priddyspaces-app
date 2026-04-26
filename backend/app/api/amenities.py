from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.schemas.amenity import AmenityCreate, AmenityOut, AmenityUpdate
from app.services.amenities import create_amenity, delete_amenity, list_org_amenities, update_amenity
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_admin_staff, require_owner_or_admin
from app.services.lookups import get_org_by_public_id

router = APIRouter()


@router.get("/orgs/{org_public_id}/amenities", response_model=list[AmenityOut])
def list_amenities(
    org_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = get_org_by_public_id(db, org_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_admin_staff(member)
    return list_org_amenities(db, org.id)


@router.post("/orgs/{org_public_id}/amenities", response_model=AmenityOut)
def create_org_amenity(
    org_public_id: str,
    payload: AmenityCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = get_org_by_public_id(db, org_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    return create_amenity(db, org.id, payload.name)


@router.patch("/orgs/{org_public_id}/amenities/{amenity_id}", response_model=AmenityOut)
def update_org_amenity(
    org_public_id: str,
    amenity_id: int,
    payload: AmenityUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = get_org_by_public_id(db, org_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    return update_amenity(db, org.id, amenity_id, payload.name)


@router.delete("/orgs/{org_public_id}/amenities/{amenity_id}")
def delete_org_amenity(
    org_public_id: str,
    amenity_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = get_org_by_public_id(db, org_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    delete_amenity(db, org.id, amenity_id)
    return {"ok": True}
