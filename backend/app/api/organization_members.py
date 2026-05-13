from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import UserAppRole, UserRole
from app.models.location import Location
from app.models.location_admin import LocationAdmin
from app.models.organization_member import OrganizationMember
from app.models.user import User
from app.schemas.organization_member import (
    OrganizationMemberCreate,
    OrganizationMemberDetailOut,
    OrganizationMemberOut,
    OrganizationMemberUpdate,
)
from app.services.email_identity import get_user_by_normalized_email, normalize_email
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin
from app.services.lookups import get_org_by_public_id
from app.services.notifications import send_email

router = APIRouter()


def _default_receives_new_booking_email(role: UserRole) -> bool:
    return role in {UserRole.OWNER, UserRole.ADMIN}


def _resolve_member_user(db: Session, payload: OrganizationMemberCreate) -> User:
    if payload.user_public_id:
        user = db.query(User).filter(User.public_id == payload.user_public_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    normalized_email = normalize_email(str(payload.email))
    user = get_user_by_normalized_email(db, normalized_email)
    if user:
        return user

    # Admin and staff use the owner-side shell in the current app.
    user = User(email=normalized_email, role=UserAppRole.OWNER, email_verified=False, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _sync_location_assignments(
    db: Session,
    org_id: int,
    user_id: int,
    location_public_ids: list[str],
) -> list[str]:
    locations = []
    if location_public_ids:
        locations = (
            db.query(Location)
            .filter(
                Location.organization_id == org_id,
                Location.public_id.in_(location_public_ids),
            )
            .all()
        )
        if len(locations) != len(set(location_public_ids)):
            raise HTTPException(status_code=400, detail="One or more locations are invalid for this organization")

    db.query(LocationAdmin).filter(
        LocationAdmin.user_id == user_id,
        LocationAdmin.tenant_id == org_id,
    ).delete(synchronize_session=False)

    for location in locations:
        db.add(
            LocationAdmin(
                location_id=location.id,
                user_id=user_id,
                tenant_id=org_id,
            )
        )

    db.commit()
    return [location.public_id for location in locations]


@router.post("/orgs/{org_public_id}/members", response_model=OrganizationMemberOut)
def add_member(
    org_public_id: str,
    payload: OrganizationMemberCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = get_org_by_public_id(db, org_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    requester = get_or_create_user(db, token)
    requester_member = get_org_member(db, org.id, requester.id)
    require_owner_or_admin(requester_member)

    if payload.role != UserRole.OWNER and not payload.location_public_ids:
        raise HTTPException(status_code=400, detail="Admins and staff must be assigned to at least one location")

    user = _resolve_member_user(db, payload)

    existing = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == user.id,
        )
        .first()
    )
    if existing:
        member = existing
        member.role = payload.role
        member.can_override_pricing = payload.can_override_pricing
        if payload.receives_new_booking_email is not None:
            member.receives_new_booking_email = payload.receives_new_booking_email
    else:
        member = OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=user.id,
            role=payload.role,
            can_override_pricing=payload.can_override_pricing,
            receives_new_booking_email=(
                payload.receives_new_booking_email
                if payload.receives_new_booking_email is not None
                else _default_receives_new_booking_email(payload.role)
            ),
        )
        db.add(member)

    if payload.role in {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF} and user.role != UserAppRole.OWNER:
        user.role = UserAppRole.OWNER
        db.add(user)

    db.commit()
    db.refresh(member)

    if payload.role == UserRole.OWNER:
        location_public_ids: list[str] = []
    else:
        location_public_ids = _sync_location_assignments(db, org.id, user.id, payload.location_public_ids)

    if payload.email:
        send_email(
            str(payload.email),
            "You have been added to Priddyspaces",
            f"You were added to {org.name} as {payload.role.value}.",
        )

    return OrganizationMemberOut(
        public_id=member.public_id,
        user_id=member.user_id,
        role=member.role,
        can_override_pricing=member.can_override_pricing,
        receives_new_booking_email=member.receives_new_booking_email,
        location_public_ids=location_public_ids,
    )


@router.get("/orgs/{org_public_id}/members", response_model=list[OrganizationMemberDetailOut])
def list_members(
    org_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    org = get_org_by_public_id(db, org_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    requester = get_or_create_user(db, token)
    requester_member = get_org_member(db, org.id, requester.id)
    require_owner_or_admin(requester_member)

    members = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(OrganizationMember.organization_id == org.id)
        .all()
    )

    results: list[OrganizationMemberDetailOut] = []
    for member, user in members:
        assigned_locations = (
            db.query(Location.public_id)
            .join(LocationAdmin, LocationAdmin.location_id == Location.id)
            .filter(
                LocationAdmin.user_id == user.id,
                LocationAdmin.tenant_id == org.id,
            )
            .all()
        )
        results.append(
            OrganizationMemberDetailOut(
                public_id=member.public_id,
                user_id=member.user_id,
                user_public_id=user.public_id,
                user_email=user.email,
                role=member.role,
                can_override_pricing=member.can_override_pricing,
                receives_new_booking_email=member.receives_new_booking_email,
                location_public_ids=[public_id for public_id, in assigned_locations],
            )
        )
    return results


@router.patch("/orgs/{org_public_id}/members/{member_public_id}", response_model=OrganizationMemberDetailOut)
def update_member(
    org_public_id: str,
    member_public_id: str,
    payload: OrganizationMemberUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = get_org_by_public_id(db, org_public_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    requester = get_or_create_user(db, token)
    requester_member = get_org_member(db, org.id, requester.id)
    require_owner_or_admin(requester_member)

    row = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.public_id == member_public_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Team member not found")

    member, user = row
    if payload.receives_new_booking_email is not None:
        member.receives_new_booking_email = payload.receives_new_booking_email

    db.add(member)
    db.commit()
    db.refresh(member)

    assigned_locations = (
        db.query(Location.public_id)
        .join(LocationAdmin, LocationAdmin.location_id == Location.id)
        .filter(
            LocationAdmin.user_id == user.id,
            LocationAdmin.tenant_id == org.id,
        )
        .all()
    )
    return OrganizationMemberDetailOut(
        public_id=member.public_id,
        user_id=member.user_id,
        user_public_id=user.public_id,
        user_email=user.email,
        role=member.role,
        can_override_pricing=member.can_override_pricing,
        receives_new_booking_email=member.receives_new_booking_email,
        location_public_ids=[public_id for public_id, in assigned_locations],
    )
