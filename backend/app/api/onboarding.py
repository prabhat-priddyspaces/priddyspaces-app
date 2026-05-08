"""Onboarding endpoints — called after Clerk sign-up to capture role, profile,
and organization details. All routes require a valid Clerk JWT.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.deps import get_db
from app.models.enums import OrganizationReviewStatus, UserAppRole, UserRole
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User
from app.schemas.auth import MeOut
from app.services.amenities import seed_default_amenities
from app.services.platform_auth import (
    build_default_route,
    get_effective_user,
    get_platform_member_for_token,
    is_impersonating,
    get_actor_user,
)
from app.schemas.auth import ImpersonationContextOut

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

_ORG_SIZES = {"1-10", "11-50", "51-200", "200+"}


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ProfileIn(BaseModel):
    role: UserAppRole
    full_name: str | None = None
    phone: str | None = None
    country: str | None = None
    timezone: str | None = None
    terms_accepted: bool = False
    privacy_policy_accepted: bool = False

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("full_name cannot be blank")
        return v


class OrgIn(BaseModel):
    name: str
    industry: str | None = None
    size: str | None = None
    website: str | None = None

    @field_validator("name")
    @classmethod
    def name_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Organization name is required")
        return v.strip()

    @field_validator("size")
    @classmethod
    def size_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in _ORG_SIZES:
            raise ValueError(f"size must be one of {_ORG_SIZES}")
        return v


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _update_clerk_metadata(clerk_id: str, metadata: dict) -> None:
    """PATCH Clerk user publicMetadata via REST API. Best-effort: logs on failure."""
    if not settings.CLERK_SECRET_KEY:
        return
    try:
        existing_resp = httpx.get(
            f"https://api.clerk.com/v1/users/{clerk_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            timeout=5.0,
        )
        existing_meta = existing_resp.json().get("public_metadata", {}) or {}
        merged = {**existing_meta, **metadata}
        httpx.patch(
            f"https://api.clerk.com/v1/users/{clerk_id}",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
            json={"public_metadata": merged},
            timeout=5.0,
        )
    except Exception:  # noqa: BLE001
        pass  # Webhook will reconcile eventually


def _has_organization(db: Session, user_id: int) -> bool:
    return db.query(Organization).filter(Organization.owner_id == user_id).first() is not None


def _build_me_out(db: Session, user: User, token: dict) -> MeOut:
    actor = get_actor_user(db, token)
    platform_member = get_platform_member_for_token(db, token)
    impersonating = is_impersonating(token)
    app_role = user.role
    platform_role = platform_member.role if platform_member else None
    has_org = _has_organization(db, user.id)
    return MeOut(
        public_id=str(user.public_id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        company_name=user.company_name,
        role=user.role.value if user.role else None,
        app_role=app_role,
        platform_role=platform_role,
        has_organization=has_org,
        default_route=build_default_route(
            app_role=app_role,
            platform_role=platform_role,
            impersonating=impersonating,
            has_organization=has_org,
        ),
        impersonation=ImpersonationContextOut(
            is_impersonating=impersonating,
            actor_public_id=str(actor.public_id) if impersonating else None,
            actor_email=actor.email if impersonating else None,
            actor_platform_role=platform_role if impersonating else None,
            target_public_id=str(user.public_id) if impersonating else None,
            target_email=user.email if impersonating else None,
            reason=token.get("impersonation_reason") if impersonating else None,
        ),
        terms_accepted_at=user.terms_accepted_at,
        privacy_policy_accepted_at=user.privacy_policy_accepted_at,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/profile", response_model=MeOut)
def complete_profile(
    payload: ProfileIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
) -> MeOut:
    """Set role, basic profile fields, and accept T&C. Called once after sign-up."""
    user = get_effective_user(db, token)
    now = datetime.now(timezone.utc)

    user.role = payload.role
    if payload.full_name:
        parts = payload.full_name.strip().split(" ", 1)
        user.first_name = parts[0]
        user.last_name = parts[1] if len(parts) > 1 else user.last_name
        user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone or None
    if payload.terms_accepted:
        user.terms_accepted_at = now
    if payload.privacy_policy_accepted:
        user.privacy_policy_accepted_at = now

    db.add(user)
    db.commit()
    db.refresh(user)

    # Sync role to Clerk publicMetadata so JWT claims are updated on next token
    clerk_id: str = token.get("sub", "")
    if clerk_id:
        _update_clerk_metadata(clerk_id, {"role": payload.role.value})

    return _build_me_out(db, user, token)


@router.post("/organization", response_model=MeOut)
def complete_organization(
    payload: OrgIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
) -> MeOut:
    """Create the owner's organization. Owner-only; idempotent on name change."""
    user = get_effective_user(db, token)

    if user.role != UserAppRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owners can create an organization")

    # Idempotency: if owner already has an org, update it rather than creating a duplicate
    existing_org = db.query(Organization).filter(Organization.owner_id == user.id).first()
    if existing_org:
        existing_org.name = payload.name
        existing_org.industry = payload.industry
        existing_org.size = payload.size
        existing_org.website = payload.website
        existing_org.onboarding_completed = True
        db.add(existing_org)
        db.commit()
        db.refresh(existing_org)
        return _build_me_out(db, user, token)

    org = Organization(
        name=payload.name,
        owner_id=user.id,
        review_status=OrganizationReviewStatus.APPROVED,
        onboarding_completed=True,
        industry=payload.industry,
        size=payload.size,
        website=payload.website,
    )
    db.add(org)
    db.flush()

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=user.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
    )
    db.add(member)
    seed_default_amenities(db, org.id)
    db.commit()

    return _build_me_out(db, user, token)
