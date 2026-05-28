from datetime import datetime, timezone

from html import escape

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.deps import get_db
from app.models.audit_log import AuditLog
from app.models.enums import OrganizationReviewStatus, PlatformTeamRole, UserRole
from app.models.organization import Organization
from app.models.platform_team_member import PlatformTeamMember
from app.models.user import User
from app.schemas.organization import (
    OrganizationApprovalRequestOut,
    OrganizationCreate,
    OrganizationOut,
    OrganizationUpdate,
)
from app.services.amenities import seed_default_amenities
from app.services.auth_user import get_or_create_user
from app.models.organization_member import OrganizationMember
from app.services.audit import write_audit_log
from app.services.authz import get_org_member, require_owner_admin_staff
from app.services.notifications import send_email
from app.services.platform_auth import get_audit_actor_context, get_platform_member_for_token

router = APIRouter()


def _frontend_href(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _superadmin_emails(db: Session) -> list[str]:
    rows = (
        db.query(User.email)
        .join(PlatformTeamMember, PlatformTeamMember.user_id == User.id)
        .filter(
            PlatformTeamMember.role == PlatformTeamRole.SUPERADMIN,
            PlatformTeamMember.is_active.is_(True),
            User.is_active.is_(True),
        )
        .all()
    )
    emails = [row.email for row in rows if row.email]
    emails.extend(
        email.strip()
        for email in settings.PLATFORM_ADMIN_EMAILS.split(",")
        if email.strip()
    )
    deduped: list[str] = []
    seen: set[str] = set()
    for email in emails:
        key = email.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(email)
    return deduped


def _send_approval_request_email(
    db: Session,
    *,
    org: Organization,
    requester: User,
    recipients: list[str],
) -> None:
    view_url = _frontend_href(f"/admin/owner-companies?company={org.public_id}")
    approve_url = _frontend_href(
        f"/admin/owner-companies?company={org.public_id}&action=approve"
    )
    subject = f"Owner company approval requested: {org.name}"
    text = "\n".join(
        [
            f"{requester.email} requested marketplace approval for {org.name}.",
            f"Current status: {org.review_status.value}",
            "",
            f"View company: {view_url}",
            f"Approve company: {approve_url}",
        ]
    )
    html = "\n".join(
        [
            f"<p>{escape(requester.email)} requested marketplace approval for <strong>{escape(org.name)}</strong>.</p>",
            f"<p>Current status: <strong>{escape(org.review_status.value)}</strong></p>",
            f'<p><a href="{escape(view_url)}">View company</a></p>',
            f'<p><a href="{escape(approve_url)}">Approve company</a></p>',
        ]
    )
    for recipient in recipients:
        send_email(recipient, subject, text, db=db, html_body=html)


@router.post("/orgs", response_model=OrganizationOut)
def create_org(
    payload: OrganizationCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    org = Organization(
        name=payload.name,
        owner_id=0,
        review_status=OrganizationReviewStatus.PENDING,
    )
    org.owner_id = user.id
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=user.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db.add(member)
    seed_default_amenities(db, org.id)
    db.commit()
    return org


@router.get("/orgs/{public_id}", response_model=OrganizationOut)
def get_org(
    public_id: str,
    db: Session = Depends(get_db),
    _user: dict = Depends(get_current_user)
):
    org = db.query(Organization).filter(Organization.public_id == public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, _user)
    member = get_org_member(db, org.id, user.id)
    require_owner_admin_staff(member)
    return org


@router.get("/orgs", response_model=list[OrganizationOut])
def list_my_orgs(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    orgs = (
        db.query(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .filter(
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active.is_(True)
        )
        .all()
    )
    return orgs


@router.patch("/orgs/{public_id}", response_model=OrganizationOut)
def update_org(
    public_id: str,
    payload: OrganizationUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.public_id == public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_admin_staff(member)

    before = {
        "name": org.name,
        "branding": org.branding,
        "review_status": org.review_status.value,
        "review_notes": org.review_notes,
    }

    if payload.name is not None:
        org.name = payload.name.strip() or org.name
    if payload.branding is not None:
        org.branding = payload.branding.strip() or None
    if payload.resubmit_for_review:
        org.review_status = OrganizationReviewStatus.PENDING
        org.review_notes = None
        org.reviewed_by_user_id = None
        org.reviewed_at = None

    db.add(org)
    db.commit()
    db.refresh(org)

    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db=db,
        actor_id=actor_id,
        action="organization_resubmitted" if payload.resubmit_for_review else "organization_updated",
        entity_type="organization",
        entity_public_id=org.public_id,
        before_state=before,
        after_state={
            "name": org.name,
            "branding": org.branding,
            "review_status": org.review_status.value,
            "review_notes": org.review_notes,
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return org


@router.post("/orgs/{public_id}/approval-request", response_model=OrganizationApprovalRequestOut)
def request_org_approval(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.public_id == public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    requester = get_or_create_user(db, token)
    member = get_org_member(db, org.id, requester.id)
    require_owner_admin_staff(member)

    if org.review_status == OrganizationReviewStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Organization is already approved")

    recipients = _superadmin_emails(db)
    if not recipients:
        raise HTTPException(status_code=400, detail="No platform super admins are configured for approval notifications")

    before = {
        "review_status": org.review_status.value,
        "review_notes": org.review_notes,
    }
    if org.review_status == OrganizationReviewStatus.REJECTED:
        org.review_status = OrganizationReviewStatus.PENDING
        org.review_notes = None
        org.reviewed_by_user_id = None
        org.reviewed_at = None
        db.add(org)
        db.commit()
        db.refresh(org)

    _send_approval_request_email(db, org=org, requester=requester, recipients=recipients)

    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db=db,
        actor_id=actor_id,
        action="organization_approval_requested",
        entity_type="organization",
        entity_public_id=org.public_id,
        before_state=before,
        after_state={
            "review_status": org.review_status.value,
            "review_notes": org.review_notes,
            "recipients_notified": len(recipients),
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )

    return OrganizationApprovalRequestOut(
        public_id=org.public_id,
        review_status=org.review_status,
        recipients_notified=len(recipients),
    )
