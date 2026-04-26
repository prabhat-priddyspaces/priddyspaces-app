from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.schemas.auth import ImpersonationContextOut, MeOut, MeUpdateIn
from app.services.platform_auth import (
    build_default_route,
    get_actor_user,
    get_effective_user,
    get_platform_member_for_token,
    is_impersonating,
)

router = APIRouter(prefix="/api", tags=["me"])

@router.get("/me", response_model=MeOut)
def get_me(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
) -> MeOut:
    user = get_effective_user(db, token)
    actor = get_actor_user(db, token)
    platform_member = get_platform_member_for_token(db, token)
    impersonating = is_impersonating(token)
    app_role = user.role
    platform_role = platform_member.role if platform_member else None
    return MeOut(
        public_id=str(user.public_id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value if user.role else None,
        app_role=app_role,
        platform_role=platform_role,
        default_route=build_default_route(
            app_role=app_role,
            platform_role=platform_role,
            impersonating=impersonating,
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


@router.patch("/me", response_model=MeOut)
def update_me(
    payload: MeUpdateIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
) -> MeOut:
    user = get_effective_user(db, token)
    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name
    if payload.role is not None and user.role is None:
        user.role = payload.role
    if payload.terms_accepted is True:
        user.terms_accepted_at = datetime.now(timezone.utc)
    if payload.privacy_policy_accepted is True:
        user.privacy_policy_accepted_at = datetime.now(timezone.utc)
    if payload.first_name is not None or payload.last_name is not None:
        parts = [user.first_name or "", user.last_name or ""]
        user.full_name = " ".join(p for p in parts if p).strip() or None
    db.add(user)
    db.commit()
    db.refresh(user)
    actor = get_actor_user(db, token)
    platform_member = get_platform_member_for_token(db, token)
    impersonating = is_impersonating(token)
    app_role = user.role
    platform_role = platform_member.role if platform_member else None
    return MeOut(
        public_id=str(user.public_id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role.value if user.role else None,
        app_role=app_role,
        platform_role=platform_role,
        default_route=build_default_route(
            app_role=app_role,
            platform_role=platform_role,
            impersonating=impersonating,
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
