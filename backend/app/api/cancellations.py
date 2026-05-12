from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.cancellation_policy import CancellationPolicy
from app.models.cancellation_policy_tier import CancellationPolicyTier
from app.models.organization import Organization
from app.schemas.cancellation import CancellationPolicyCreate, CancellationPolicyOut, CancellationPolicyTierOut
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin

router = APIRouter()


def _serialize_policy(db: Session, policy: CancellationPolicy) -> CancellationPolicyOut:
    tiers = (
        db.query(CancellationPolicyTier)
        .filter(CancellationPolicyTier.cancellation_policy_id == policy.id)
        .order_by(CancellationPolicyTier.min_hours_before_start.desc())
        .all()
    )
    return CancellationPolicyOut(
        public_id=policy.public_id,
        space_type=policy.space_type,
        cancel_window_hours=policy.cancel_window_hours,
        refund_percent=policy.refund_percent,
        tiers=[
            CancellationPolicyTierOut(
                public_id=tier.public_id,
                min_hours_before_start=tier.min_hours_before_start,
                refund_percent=tier.refund_percent,
                sort_order=tier.sort_order,
            )
            for tier in tiers
        ],
    )


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
    db.flush()
    for index, tier in enumerate(payload.tiers or []):
        db.add(
            CancellationPolicyTier(
                cancellation_policy_id=policy.id,
                min_hours_before_start=tier.min_hours_before_start,
                refund_percent=tier.refund_percent,
                sort_order=index,
            )
        )
    db.commit()
    db.refresh(policy)
    return _serialize_policy(db, policy)


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
    policies = db.query(CancellationPolicy).filter(CancellationPolicy.tenant_id == org.id).all()
    return [_serialize_policy(db, policy) for policy in policies]
