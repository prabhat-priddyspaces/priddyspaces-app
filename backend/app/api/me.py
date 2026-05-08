from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking import Booking
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.models.subscription import Subscription
from app.schemas.auth import ImpersonationContextOut, MeOut, MeUpdateIn
from app.schemas.calendar import CalendarResponse
from app.services.calendar_events import build_calendar_events
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
    has_org = db.query(Organization).filter(Organization.owner_id == user.id).first() is not None
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


@router.get("/me/calendar", response_model=CalendarResponse)
def my_calendar(
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
) -> CalendarResponse:
    user = get_effective_user(db, token)
    # Find every location where this user has any booking, request, or subscription.
    space_ids: set[int] = set()
    for (sid,) in db.query(Booking.space_id).filter(Booking.user_id == user.id).distinct():
        space_ids.add(sid)
    for (sid,) in (
        db.query(Subscription.space_id).filter(Subscription.user_id == user.id).distinct()
    ):
        space_ids.add(sid)
    location_ids: set[int] = set()
    if space_ids:
        for (lid,) in (
            db.query(Space.location_id).filter(Space.id.in_(space_ids)).distinct()
        ):
            location_ids.add(lid)
    if not location_ids:
        return CalendarResponse(start=start, end=end, events=[], spaces=[], truncated=False)
    return build_calendar_events(
        db,
        location_ids=location_ids,
        start=start,
        end=end,
        user_id_filter=user.id,
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
    if payload.phone is not None:
        user.phone = payload.phone or None
    if payload.company_name is not None:
        user.company_name = payload.company_name or None
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
    has_org = db.query(Organization).filter(Organization.owner_id == user.id).first() is not None
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
