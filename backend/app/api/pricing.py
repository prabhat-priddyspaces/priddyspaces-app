from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking_promotion import BookingPromotion
from app.models.enums import PaymentStatus
from app.models.payment import Payment
from app.models.pricing_rule import PricingRule
from app.models.promo_code import PromoCode
from app.models.tax_config import TaxConfig
from app.models.space import Space
from app.schemas.pricing import (
    PricingRuleCreate,
    PricingRuleOut,
    PromoCodeCreate,
    PromoCodeOut,
    TaxConfigIn,
    TaxConfigOut
)
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin
from app.services.lookups import get_org_by_public_id
from app.services.audit import write_audit_log
from app.services.platform_auth import get_audit_actor_context
from app.services.promo_codes import normalize_promo_code, promo_status

router = APIRouter()


def _promo_out(db: Session, promo: PromoCode) -> PromoCodeOut:
    total_discount = (
        db.query(func.coalesce(func.sum(BookingPromotion.discount_amount), 0))
        .filter(BookingPromotion.promo_code_id == promo.id)
        .scalar()
        or 0
    )
    revenue_impacted = (
        db.query(func.coalesce(func.sum(Payment.amount_cents), 0))
        .join(BookingPromotion, BookingPromotion.booking_request_id == Payment.booking_request_id)
        .filter(
            BookingPromotion.promo_code_id == promo.id,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .scalar()
        or 0
    )
    return PromoCodeOut(
        public_id=promo.public_id,
        code=promo.code,
        description=promo.description,
        discount_type=promo.discount_type,
        discount_value=promo.discount_value,
        starts_at=promo.starts_at,
        ends_at=promo.ends_at,
        expires_at=promo.expires_at,
        max_redemptions=promo.max_redemptions,
        max_redemptions_per_member=promo.max_redemptions_per_member,
        total_redemptions=promo.total_redemptions or 0,
        is_active=bool(promo.is_active),
        total_discount_granted_cents=int(total_discount),
        revenue_impacted_cents=int(revenue_impacted),
        status=promo_status(promo),
    )


@router.post("/pricing-rules", response_model=PricingRuleOut)
def create_pricing_rule(
    payload: PricingRuleCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    member = get_org_member(db, space.tenant_id, user.id)
    require_owner_or_admin(member)

    rule = PricingRule(
        tenant_id=space.tenant_id,
        space_id=space.id,
        rate_type=payload.rate_type,
        rate_amount=payload.rate_amount,
        active_from=payload.active_from,
        active_to=payload.active_to
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="pricing_rule_created",
        entity_type="pricing_rule",
        entity_public_id=rule.public_id,
        before_state=None,
        after_state={
            "rate_type": rule.rate_type,
            "rate_amount": rule.rate_amount,
            "active_from": rule.active_from.isoformat() if rule.active_from else None,
            "active_to": rule.active_to.isoformat() if rule.active_to else None
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return rule


@router.get("/pricing-rules", response_model=list[PricingRuleOut])
def list_pricing_rules(
    space_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    member = get_org_member(db, space.tenant_id, user.id)
    require_owner_or_admin(member)
    return db.query(PricingRule).filter(PricingRule.space_id == space.id).all()


@router.post("/promo-codes", response_model=PromoCodeOut)
def create_promo_code(
    organization_public_id: str,
    payload: PromoCodeCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = get_org_by_public_id(db, organization_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    normalized_code = normalize_promo_code(payload.code)
    if not normalized_code:
        raise HTTPException(status_code=400, detail="Invalid promo code")
    expires_at = payload.expires_at or payload.ends_at
    code = PromoCode(
        tenant_id=org.id,
        code=normalized_code,
        description=payload.description.strip() if payload.description else None,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        expires_at=expires_at,
        max_redemptions=payload.max_redemptions,
        max_redemptions_per_member=payload.max_redemptions_per_member,
        is_active=payload.is_active,
    )
    db.add(code)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Promo code already exists for this owner")
    db.refresh(code)
    return _promo_out(db, code)


@router.get("/promo-codes", response_model=list[PromoCodeOut])
def list_promo_codes(
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
    promos = (
        db.query(PromoCode)
        .filter(PromoCode.tenant_id == org.id)
        .order_by(PromoCode.created_at.desc())
        .all()
    )
    return [_promo_out(db, promo) for promo in promos]


@router.post("/tax-config", response_model=TaxConfigOut)
def upsert_tax_config(
    organization_public_id: str,
    payload: TaxConfigIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = get_org_by_public_id(db, organization_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    config = db.query(TaxConfig).filter(TaxConfig.tenant_id == org.id).first()
    if not config:
        config = TaxConfig(tenant_id=org.id, rate_percent=payload.rate_percent)
    else:
        config.rate_percent = payload.rate_percent
    db.add(config)
    db.commit()
    db.refresh(config)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="tax_config_updated",
        entity_type="tax_config",
        entity_public_id=config.public_id,
        before_state=None,
        after_state={"rate_percent": config.rate_percent},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return config


@router.get("/tax-config", response_model=TaxConfigOut)
def get_tax_config(
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

    config = db.query(TaxConfig).filter(TaxConfig.tenant_id == org.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Tax config not found")
    return config
