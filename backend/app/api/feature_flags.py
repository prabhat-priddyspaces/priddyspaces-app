from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.feature_flag import FeatureFlag
from app.models.organization import Organization
from app.models.space import Space
from app.schemas.feature_flag import FeatureFlagCreate, FeatureFlagOut
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin

router = APIRouter()


@router.post("/feature-flags", response_model=FeatureFlagOut)
def create_feature_flag(
    payload: FeatureFlagCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)

    scope_id = None
    tenant_id = None
    if payload.scope_type == "tenant":
        org = db.query(Organization).filter(Organization.public_id == payload.scope_public_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        member = get_org_member(db, org.id, user.id)
        require_owner_or_admin(member)
        scope_id = org.id
        tenant_id = org.id
    elif payload.scope_type == "space":
        space = db.query(Space).filter(Space.public_id == payload.scope_public_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        member = get_org_member(db, space.tenant_id, user.id)
        require_owner_or_admin(member)
        scope_id = space.id
        tenant_id = space.tenant_id
    else:
        raise HTTPException(status_code=400, detail="Invalid scope_type")

    flag = FeatureFlag(
        tenant_id=tenant_id,
        flag_key=payload.flag_key,
        flag_value=payload.flag_value,
        scope_type=payload.scope_type,
        scope_id=scope_id
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return flag


@router.get("/feature-flags", response_model=list[FeatureFlagOut])
def list_feature_flags(
    scope_type: str,
    scope_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    if scope_type == "tenant":
        org = db.query(Organization).filter(Organization.public_id == scope_public_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        member = get_org_member(db, org.id, user.id)
        require_owner_or_admin(member)
        return db.query(FeatureFlag).filter(
            FeatureFlag.scope_type == "tenant",
            FeatureFlag.scope_id == org.id
        ).all()
    if scope_type == "space":
        space = db.query(Space).filter(Space.public_id == scope_public_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        member = get_org_member(db, space.tenant_id, user.id)
        require_owner_or_admin(member)
        return db.query(FeatureFlag).filter(
            FeatureFlag.scope_type == "space",
            FeatureFlag.scope_id == space.id
        ).all()
    raise HTTPException(status_code=400, detail="Invalid scope_type")
