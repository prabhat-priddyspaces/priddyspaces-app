from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.location import Location
from app.models.location_admin import LocationAdmin
from app.models.organization_member import OrganizationMember
from app.models.enums import UserRole
from app.core.config import settings


def get_org_member(db: Session, organization_id: int, user_id: int) -> OrganizationMember | None:
    return (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.is_active.is_(True)
        )
        .first()
    )


def list_org_members(
    db: Session,
    user_id: int,
    roles: set[UserRole] | None = None,
) -> list[OrganizationMember]:
    query = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user_id,
            OrganizationMember.is_active.is_(True),
        )
    )
    if roles:
        query = query.filter(OrganizationMember.role.in_(roles))
    return query.all()


def require_org_roles(member: OrganizationMember | None, roles: set[UserRole]) -> None:
    if not member or member.role not in roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def require_owner_or_admin(member: OrganizationMember | None) -> None:
    require_org_roles(member, {UserRole.OWNER, UserRole.ADMIN})


def require_owner_admin_staff(member: OrganizationMember | None) -> None:
    require_org_roles(member, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})


def require_pricing_override(member: OrganizationMember | None) -> None:
    if not member or not member.can_override_pricing:
        raise HTTPException(status_code=403, detail="Pricing override not allowed")


def user_can_access_location(
    db: Session,
    user_id: int,
    location: Location,
    roles: set[UserRole],
) -> bool:
    member = get_org_member(db, location.organization_id, user_id)
    if not member or member.role not in roles:
        return False
    if member.role == UserRole.OWNER:
        return True
    return (
        db.query(LocationAdmin)
        .filter(
            LocationAdmin.user_id == user_id,
            LocationAdmin.location_id == location.id,
            LocationAdmin.tenant_id == location.organization_id,
        )
        .first()
        is not None
    )


def require_location_roles(
    db: Session,
    user_id: int,
    location: Location,
    roles: set[UserRole],
    *,
    detail: str = "Insufficient permissions",
    status_code: int = 403,
) -> None:
    if not user_can_access_location(db, user_id, location, roles):
        raise HTTPException(status_code=status_code, detail=detail)


def accessible_location_ids(
    db: Session,
    user_id: int,
    roles: set[UserRole],
) -> set[int]:
    members = list_org_members(db, user_id, roles)
    if not members:
        return set()

    owner_org_ids = {member.organization_id for member in members if member.role == UserRole.OWNER}
    scoped_tenant_ids = {
        member.organization_id for member in members if member.role in {UserRole.ADMIN, UserRole.STAFF}
    }

    location_ids: set[int] = set()
    if owner_org_ids:
        owner_locations = (
            db.query(Location.id)
            .filter(Location.organization_id.in_(owner_org_ids))
            .all()
        )
        location_ids.update(location_id for location_id, in owner_locations)

    if scoped_tenant_ids:
        scoped_locations = (
            db.query(LocationAdmin.location_id)
            .filter(
                LocationAdmin.user_id == user_id,
                LocationAdmin.tenant_id.in_(scoped_tenant_ids),
            )
            .all()
        )
        location_ids.update(location_id for location_id, in scoped_locations)

    return location_ids


def require_platform_admin(user: dict) -> None:
    allowed = {email.strip().lower() for email in settings.PLATFORM_ADMIN_EMAILS.split(",") if email.strip()}
    if not allowed:
        raise HTTPException(status_code=403, detail="Platform admin not configured")
    email = (user.get("email") or "").lower()
    if email not in allowed:
        raise HTTPException(status_code=403, detail="Platform admin only")
