from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.jwt import issue_token
from app.core.password import hash_password
from app.models.enums import OrganizationReviewStatus, PlatformTeamRole, UserAppRole, UserRole
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_setting import PlatformSetting
from app.models.platform_team_member import PlatformTeamMember
from app.models.user import User
from app.services.email_identity import get_user_by_normalized_email, normalize_email


def get_user_for_token_subject(db: Session, subject: str | None) -> User | None:
    """Look up a user by their Clerk user ID (stored in auth_subject)."""
    if not subject:
        return None
    # Clerk user IDs are stored in auth_subject (format: user_xxx)
    user = db.query(User).filter(User.auth_subject == subject).first()
    if user:
        return user
    # Legacy fallback for public_id-based tokens
    return db.query(User).filter(User.public_id == subject).first()


def get_effective_user(db: Session, token: dict) -> User:
    user = get_user_for_token_subject(db, token.get("sub"))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")
    return user


def infer_app_role(db: Session, user: User) -> UserAppRole | None:
    if user.role is not None:
        return user.role
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active.is_(True),
        )
        .order_by(OrganizationMember.created_at.desc())
        .first()
    )
    if not membership:
        return None
    if membership.role in {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}:
        return UserAppRole.OWNER
    if membership.role == UserRole.MEMBER:
        return UserAppRole.MEMBER
    return None


def get_actor_user(db: Session, token: dict) -> User:
    actor = get_user_for_token_subject(db, token.get("actor_sub") or token.get("sub"))
    if not actor:
        raise HTTPException(status_code=401, detail="User not found")
    if not actor.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")
    return actor


def get_active_platform_member(db: Session, user_id: int) -> PlatformTeamMember | None:
    return (
        db.query(PlatformTeamMember)
        .filter(
            PlatformTeamMember.user_id == user_id,
            PlatformTeamMember.is_active.is_(True),
        )
        .first()
    )


def get_platform_member_for_token(db: Session, token: dict) -> PlatformTeamMember | None:
    actor = get_actor_user(db, token)
    return get_active_platform_member(db, actor.id)


def require_platform_roles(
    db: Session,
    token: dict,
    roles: set[PlatformTeamRole],
) -> tuple[User, PlatformTeamMember]:
    actor = get_actor_user(db, token)
    member = get_active_platform_member(db, actor.id)
    if not member or member.role not in roles:
        raise HTTPException(status_code=403, detail="Platform admin only")
    return actor, member


def require_superadmin(db: Session, token: dict) -> tuple[User, PlatformTeamMember]:
    return require_platform_roles(db, token, {PlatformTeamRole.SUPERADMIN})


def is_impersonating(token: dict) -> bool:
    return bool(token.get("actor_sub"))


def get_audit_actor_context(db: Session, token: dict) -> tuple[int, int | None, dict | None]:
    actor = get_actor_user(db, token)
    if not is_impersonating(token):
        return actor.id, None, None
    effective = get_effective_user(db, token)
    return (
        actor.id,
        effective.id,
        {
            "impersonation_reason": token.get("impersonation_reason"),
            "actor_email": actor.email,
            "effective_email": effective.email,
        },
    )


def get_or_create_platform_settings(db: Session) -> PlatformSetting:
    settings = db.query(PlatformSetting).order_by(PlatformSetting.id.asc()).first()
    if settings:
        return settings
    settings = PlatformSetting(default_owner_commission_pct=0)
    db.add(settings)
    db.flush()
    db.refresh(settings)
    return settings


def get_effective_commission_pct(db: Session, organization: Organization | None) -> int:
    if organization and organization.commission_override_pct is not None:
        return organization.commission_override_pct
    settings = get_or_create_platform_settings(db)
    return settings.default_owner_commission_pct


def calculate_commission_snapshot(amount: int | float, commission_pct: int) -> tuple[int, int]:
    gross_amount = int(round(float(amount or 0)))
    pct = max(0, commission_pct)
    platform_fee = int(round(gross_amount * pct / 100))
    owner_net = gross_amount - platform_fee
    return platform_fee, owner_net


def build_default_route(
    *,
    app_role: UserAppRole | None,
    platform_role: PlatformTeamRole | None,
    impersonating: bool,
    has_organization: bool = True,
) -> str:
    if impersonating:
        if app_role == UserAppRole.MEMBER:
            return "/member"
        if app_role == UserAppRole.OWNER:
            return "/owner"
        return "/onboarding/personal"
    if platform_role is not None:
        return "/admin"
    if app_role == UserAppRole.MEMBER:
        return "/spaces"
    if app_role == UserAppRole.OWNER:
        return "/owner" if has_organization else "/onboarding/organization"
    # No role yet → onboarding
    return "/onboarding/personal"


def touch_platform_last_login(db: Session, user_id: int) -> None:
    member = get_active_platform_member(db, user_id)
    if not member:
        return
    member.last_login_at = datetime.now(timezone.utc)
    db.add(member)
    db.commit()


def ensure_not_platform_target(db: Session, user: User) -> None:
    member = get_active_platform_member(db, user.id)
    if member:
        raise HTTPException(status_code=400, detail="Cannot impersonate platform team members")


def issue_impersonation_token(
    *,
    actor: User,
    actor_platform_member: PlatformTeamMember,
    target: User,
    target_app_role: UserAppRole | None,
    reason: str,
) -> str:
    role_val = target_app_role.value if target_app_role else None
    return issue_token(
        str(target.public_id),
        target.email,
        role_val,
        email_verified=target.email_verified,
        actor_sub=str(actor.public_id),
        actor_email=actor.email,
        actor_platform_role=actor_platform_member.role.value,
        impersonation_reason=reason,
    )


def issue_standard_token(user: User) -> str:
    role_val = user.role.value if user.role else None
    return issue_token(
        str(user.public_id),
        user.email,
        role_val,
        email_verified=user.email_verified,
    )


def bootstrap_first_superadmin(
    db: Session,
    *,
    email: str,
    force: bool = False,
    password: str | None = None,
) -> tuple[User, PlatformTeamMember, bool]:
    normalized_email = normalize_email(email)
    existing_superadmins = (
        db.query(PlatformTeamMember, User)
        .join(User, User.id == PlatformTeamMember.user_id)
        .filter(
            PlatformTeamMember.is_active.is_(True),
            PlatformTeamMember.role == PlatformTeamRole.SUPERADMIN,
        )
        .all()
    )
    if existing_superadmins and not force:
        for member, user in existing_superadmins:
            if user.email.lower() == normalized_email:
                return user, member, False
        raise RuntimeError("A superadmin already exists; rerun with --force to override")

    user = get_user_by_normalized_email(db, normalized_email)
    if not user:
        user = User(
            email=normalized_email,
            email_verified=False,
            is_active=True,
            password_hash=hash_password(password) if password else None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif password and not user.password_hash:
        user.password_hash = hash_password(password)
        db.add(user)
        db.commit()
        db.refresh(user)

    member = db.query(PlatformTeamMember).filter(PlatformTeamMember.user_id == user.id).first()
    created = False
    if not member:
        member = PlatformTeamMember(
            user_id=user.id,
            role=PlatformTeamRole.SUPERADMIN,
            is_active=True,
            invited_at=datetime.now(timezone.utc),
        )
        created = True
    else:
        member.role = PlatformTeamRole.SUPERADMIN
        member.is_active = True
        if member.invited_at is None:
            member.invited_at = datetime.now(timezone.utc)
    db.add(member)
    db.commit()
    db.refresh(member)
    return user, member, created


def organization_is_publicly_visible(organization: Organization | None) -> bool:
    if not organization:
        return False
    return organization.review_status == OrganizationReviewStatus.APPROVED
