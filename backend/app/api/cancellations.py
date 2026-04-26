from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.cancellation_policy import CancellationPolicy
from app.models.organization import Organization
from app.schemas.cancellation import CancellationPolicyCreate, CancellationPolicyOut
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin

router = APIRouter()


@router.post("/cancellation-policies", response_model=CancellationPolicyOut)
def create_cancellation_policy(
    organization_public_id: str,
    payload: CancellationPolicyCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = db.query(Organization).filter(Organization.public_id == organization_public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    policy = CancellationPolicy(
        tenant_id=org.id,
        space_type=payload.space_type,
        cancel_window_hours=payload.cancel_window_hours,
        refund_percent=payload.refund_percent
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.get("/cancellation-policies", response_model=list[CancellationPolicyOut])
def list_cancellation_policies(
    organization_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = db.query(Organization).filter(Organization.public_id == organization_public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    return db.query(CancellationPolicy).filter(CancellationPolicy.tenant_id == org.id).all()
