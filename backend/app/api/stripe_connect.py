from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import stripe

from app.core.config import settings
from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.organization import Organization
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin

stripe.api_key = settings.STRIPE_SECRET_KEY

router = APIRouter()


@router.post("/stripe/connect/onboard")
def start_connect_onboarding(
    organization_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    org = db.query(Organization).filter(Organization.public_id == organization_public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    if not org.stripe_account_id:
        account = stripe.Account.create(type="express", capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}})
        org.stripe_account_id = account.id
        db.add(org)
        db.commit()

    account_link = stripe.AccountLink.create(
        account=org.stripe_account_id,
        refresh_url=f"{settings.FRONTEND_URL}/owner",
        return_url=f"{settings.FRONTEND_URL}/owner",
        type="account_onboarding"
    )
    return {"url": account_link.url}


@router.get("/stripe/connect/status")
def connect_status(
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

    return {"stripe_account_id": org.stripe_account_id, "connected": bool(org.stripe_account_id)}
