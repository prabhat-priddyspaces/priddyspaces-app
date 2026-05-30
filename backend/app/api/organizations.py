from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import OrganizationReviewStatus, UserRole
from app.models.organization import Organization
from app.schemas.organization import (
    OrganizationApprovalRequestOut,
    OrganizationBookingSettingsOut,
    OrganizationBookingSettingsUpdate,
    OrganizationCreate,
    OrganizationOut,
    OrganizationUpdate,
)
from app.services.amenities import seed_default_amenities
from app.services.auth_user import get_or_create_user
from app.models.organization_member import OrganizationMember
from app.services.audit import write_audit_log
from app.services.authz import get_org_member, require_owner_admin_staff
from app.services.organization_approval import (
    send_organization_approval_request_email,
    superadmin_approval_recipients,
)
from app.services.platform_auth import get_audit_actor_context
from app.services.transactional_templates import ensure_default_transactional_templates

router = APIRouter()


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
    ensure_default_transactional_templates(db, org, actor_id=user.id)
    db.commit()
    send_organization_approval_request_email(db, org=org, requester=user)
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


@router.get("/orgs/{public_id}/booking-settings", response_model=OrganizationBookingSettingsOut)
def get_org_booking_settings(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.public_id == public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_admin_staff(member)
    return org


@router.patch("/orgs/{public_id}/booking-settings", response_model=OrganizationBookingSettingsOut)
def update_org_booking_settings(
    public_id: str,
    payload: OrganizationBookingSettingsUpdate,
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
        "booking_approval_mode": org.booking_approval_mode,
        "payment_failure_hold_minutes": org.payment_failure_hold_minutes,
    }
    if payload.booking_approval_mode is not None:
        org.booking_approval_mode = payload.booking_approval_mode
    if payload.payment_failure_hold_minutes is not None:
        org.payment_failure_hold_minutes = payload.payment_failure_hold_minutes
    db.add(org)
    db.commit()
    db.refresh(org)

    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db=db,
        actor_id=actor_id,
        action="organization_booking_settings_updated",
        entity_type="organization",
        entity_public_id=org.public_id,
        before_state=before,
        after_state={
            "booking_approval_mode": org.booking_approval_mode,
            "payment_failure_hold_minutes": org.payment_failure_hold_minutes,
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

    recipients = superadmin_approval_recipients(db)
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

    recipients_notified = send_organization_approval_request_email(
        db,
        org=org,
        requester=requester,
        recipients=recipients,
    )

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
            "recipients_notified": recipients_notified,
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )

    return OrganizationApprovalRequestOut(
        public_id=org.public_id,
        review_status=org.review_status,
        recipients_notified=recipients_notified,
    )
