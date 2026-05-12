from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.assistant import AssistantConversation
from app.models.enums import PlatformTeamRole, UserAppRole, UserRole
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User
from app.services.authz import accessible_location_ids, list_org_members
from app.services.platform_auth import get_active_platform_member, get_user_for_token_subject


OWNER_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}


@dataclass
class AssistantContext:
    audience: str
    user: User | None
    guest_id: str | None
    identifier: str
    tenant_ids: list[int]
    organization_ids: list[int]
    accessible_location_ids: list[int]
    platform_role: PlatformTeamRole | None = None

    @property
    def user_id(self) -> int | None:
        return self.user.id if self.user else None


def resolve_assistant_context(
    db: Session,
    *,
    token: dict | None,
    guest_id: str | None,
    client_host: str | None,
) -> AssistantContext:
    user = get_user_for_token_subject(db, token.get("sub")) if token else None
    if user and not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")

    if not user:
        audience = "guest" if guest_id else "anonymous"
        identifier = f"{audience}:{guest_id or client_host or 'unknown'}"
        return AssistantContext(
            audience=audience,
            user=None,
            guest_id=guest_id,
            identifier=identifier,
            tenant_ids=[],
            organization_ids=[],
            accessible_location_ids=[],
        )

    platform_member = get_active_platform_member(db, user.id)
    if platform_member:
        return AssistantContext(
            audience="platform_admin",
            user=user,
            guest_id=guest_id,
            identifier=f"user:{user.id}",
            tenant_ids=[],
            organization_ids=[],
            accessible_location_ids=[],
            platform_role=platform_member.role,
        )

    members: list[OrganizationMember] = list_org_members(db, user.id, OWNER_ROLES)
    if members:
        tenant_ids = sorted({m.tenant_id for m in members})
        organization_ids = sorted({m.organization_id for m in members})
        loc_ids = sorted(accessible_location_ids(db, user.id, OWNER_ROLES))
        audience = "owner" if any(m.role == UserRole.OWNER for m in members) else "staff"
        return AssistantContext(
            audience=audience,
            user=user,
            guest_id=guest_id,
            identifier=f"user:{user.id}",
            tenant_ids=tenant_ids,
            organization_ids=organization_ids,
            accessible_location_ids=loc_ids,
        )

    if user.role == UserAppRole.MEMBER:
        return AssistantContext(
            audience="member",
            user=user,
            guest_id=guest_id,
            identifier=f"user:{user.id}",
            tenant_ids=[],
            organization_ids=[],
            accessible_location_ids=[],
        )

    return AssistantContext(
        audience="guest",
        user=user,
        guest_id=guest_id,
        identifier=f"user:{user.id}",
        tenant_ids=[],
        organization_ids=[],
        accessible_location_ids=[],
    )


def require_conversation_access(conversation: AssistantConversation, ctx: AssistantContext) -> None:
    if ctx.user_id and conversation.user_id == ctx.user_id:
        return
    if ctx.guest_id and conversation.guest_id == ctx.guest_id:
        return
    if ctx.audience == "platform_admin":
        return
    raise HTTPException(status_code=404, detail="Conversation not found")


def primary_organization_id(db: Session, ctx: AssistantContext) -> int | None:
    if ctx.organization_ids:
        return ctx.organization_ids[0]
    if ctx.user_id:
        org = db.query(Organization).filter(Organization.owner_id == ctx.user_id).first()
        if org:
            return org.id
    return None
