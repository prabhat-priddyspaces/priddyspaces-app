from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.subscription_plan import SubscriptionPlan
from app.schemas.subscription_plan import SubscriptionPlanCreate, SubscriptionPlanOut, SubscriptionPlanUpdate, SubscriptionPlanPublicOut
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin
from app.services.lookups import get_org_by_public_id
from app.services.audit import write_audit_log
from app.models.space import Space
from app.models.location import Location
from app.models.enums import LocationStatus, SpaceVisibility
from app.models.organization import Organization
from app.services.platform_auth import get_audit_actor_context, organization_is_publicly_visible

router = APIRouter()


@router.post("/subscription-plans", response_model=SubscriptionPlanOut)
def create_subscription_plan(
    organization_public_id: str,
    payload: SubscriptionPlanCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = get_org_by_public_id(db, organization_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    plan = SubscriptionPlan(
        organization_id=org.id,
        tenant_id=org.id,
        name=payload.name,
        space_type=payload.space_type,
        billing_cycle=payload.billing_cycle,
        price=payload.price,
        stripe_price_id=payload.stripe_price_id,
        is_active=payload.is_active
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)

    write_audit_log(
        db,
        actor_id=actor_id,
        action="subscription_plan_created",
        entity_type="subscription_plan",
        entity_public_id=plan.public_id,
        before_state=None,
        after_state={
            "name": plan.name,
            "space_type": plan.space_type.value,
            "billing_cycle": plan.billing_cycle.value,
            "price": plan.price,
            "stripe_price_id": plan.stripe_price_id,
            "is_active": plan.is_active
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )

    return plan


@router.get("/subscription-plans", response_model=list[SubscriptionPlanOut])
def list_subscription_plans(
    organization_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = get_org_by_public_id(db, organization_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    return (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.tenant_id == org.id)
        .order_by(SubscriptionPlan.created_at.desc())
        .all()
    )


@router.get("/subscription-plans/public", response_model=list[SubscriptionPlanPublicOut])
def list_public_subscription_plans(
    space_public_id: str,
    db: Session = Depends(get_db)
):
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    if not location or location.status != LocationStatus.ACTIVE or not organization_is_publicly_visible(organization):
        raise HTTPException(status_code=404, detail="Space not found")
    if space.visibility == SpaceVisibility.PRIVATE:
        raise HTTPException(status_code=404, detail="Space not found")

    plans = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.tenant_id == space.tenant_id,
            SubscriptionPlan.space_type == space.space_type,
            SubscriptionPlan.is_active.is_(True)
        )
        .order_by(SubscriptionPlan.created_at.desc())
        .all()
    )
    return plans


@router.get("/subscription-plans/{public_id}", response_model=SubscriptionPlanOut)
def get_subscription_plan(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.public_id == public_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, plan.tenant_id, user.id)
    require_owner_or_admin(member)
    return plan


@router.patch("/subscription-plans/{public_id}", response_model=SubscriptionPlanOut)
def update_subscription_plan(
    public_id: str,
    payload: SubscriptionPlanUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.public_id == public_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, plan.tenant_id, user.id)
    require_owner_or_admin(member)

    before = {
        "name": plan.name,
        "price": plan.price,
        "stripe_price_id": plan.stripe_price_id,
        "is_active": plan.is_active
    }

    if payload.name is not None:
        plan.name = payload.name
    if payload.price is not None:
        plan.price = payload.price
    if payload.stripe_price_id is not None:
        plan.stripe_price_id = payload.stripe_price_id
    if payload.is_active is not None:
        plan.is_active = payload.is_active

    db.add(plan)
    db.commit()
    db.refresh(plan)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)

    write_audit_log(
        db,
        actor_id=actor_id,
        action="subscription_plan_updated",
        entity_type="subscription_plan",
        entity_public_id=plan.public_id,
        before_state=before,
        after_state={
            "name": plan.name,
            "price": plan.price,
            "stripe_price_id": plan.stripe_price_id,
            "is_active": plan.is_active
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )

    return plan
