from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.audit_log import AuditLog
from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    BookingRequestStatus,
    OrganizationReviewStatus,
    PaymentStatus,
    PlatformTeamRole,
    UserAppRole,
    UserRole,
)
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.location_admin import LocationAdmin
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.payment import Payment
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.admin import (
    ImpersonationStartIn,
    OrganizationAdminUpdate,
    PlatformSettingsUpdateIn,
    PlatformTeamInviteIn,
    PlatformTeamUpdateIn,
)
from app.services.audit import write_audit_log
from app.services.email_identity import get_user_by_normalized_email, normalize_email
from app.services.notifications import send_email
from app.services.platform_auth import (
    build_default_route,
    ensure_not_platform_target,
    get_audit_actor_context,
    get_effective_user,
    get_or_create_platform_settings,
    get_user_for_token_subject,
    issue_impersonation_token,
    issue_standard_token,
    require_platform_roles,
    require_superadmin,
)

router = APIRouter()

READ_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN, PlatformTeamRole.SUPPORT}
WRITE_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN}


def _user_label(user: User) -> str:
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    parts = [part.strip() for part in [user.first_name or "", user.last_name or ""] if part and part.strip()]
    return " ".join(parts) if parts else user.email


def _build_metrics(db: Session) -> dict[str, int | float]:
    tenant_count = db.query(Organization).count()
    user_count = db.query(User).count()
    member_count = db.query(User).filter(User.role == UserAppRole.MEMBER).count()
    owner_company_count = db.query(Organization).count()
    approved_owner_company_count = (
        db.query(Organization)
        .filter(Organization.review_status == OrganizationReviewStatus.APPROVED)
        .count()
    )
    pending_owner_company_count = (
        db.query(Organization)
        .filter(Organization.review_status == OrganizationReviewStatus.PENDING)
        .count()
    )
    rejected_owner_company_count = (
        db.query(Organization)
        .filter(Organization.review_status == OrganizationReviewStatus.REJECTED)
        .count()
    )
    booking_count = db.query(Booking).count()
    request_count = db.query(BookingRequest).count()
    invoice_count = db.query(Invoice).count()
    live_listing_count = (
        db.query(Space)
        .join(Location, Location.id == Space.location_id)
        .join(Organization, Organization.id == Location.organization_id)
        .filter(Organization.review_status == OrganizationReviewStatus.APPROVED)
        .count()
    )
    payments = db.query(Payment).all()
    payment_total = sum(payment.amount or 0 for payment in payments)
    succeeded_payments = [payment for payment in payments if payment.status == PaymentStatus.SUCCEEDED]
    gmv = sum(payment.amount or 0 for payment in succeeded_payments)
    platform_earnings = sum(payment.platform_fee_amount or 0 for payment in succeeded_payments)
    owner_net = sum(payment.owner_net_amount or 0 for payment in succeeded_payments)
    return {
        "tenants": tenant_count,
        "users": user_count,
        "members": member_count,
        "owner_companies": owner_company_count,
        "approved_owner_companies": approved_owner_company_count,
        "pending_owner_companies": pending_owner_company_count,
        "rejected_owner_companies": rejected_owner_company_count,
        "live_listings": live_listing_count,
        "bookings": booking_count,
        "booking_requests": request_count,
        "invoices": invoice_count,
        "payments_total": payment_total,
        "gmv": gmv,
        "platform_earnings": platform_earnings,
        "owner_net": owner_net,
    }


def _serialize_audit_logs(db: Session, logs: list[AuditLog]) -> list[dict[str, object]]:
    user_ids = {
        user_id
        for log in logs
        for user_id in [log.actor_id, log.acting_as_user_id]
        if user_id is not None
    }
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    return [
        {
            "public_id": log.public_id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_public_id": log.entity_public_id,
            "actor_email": users.get(log.actor_id).email if users.get(log.actor_id) else None,
            "acting_as_email": users.get(log.acting_as_user_id).email if users.get(log.acting_as_user_id) else None,
            "before_state": log.before_state,
            "after_state": log.after_state,
            "context": log.context,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@router.get("/admin/metrics")
def get_admin_metrics(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    return _build_metrics(db)


@router.get("/admin/dashboard")
def get_admin_dashboard(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    recent_logs = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(10)
        .all()
    )
    return {
        "metrics": _build_metrics(db),
        "recent_activity": _serialize_audit_logs(db, recent_logs),
    }


@router.get("/admin/members")
def list_members(
    q: str | None = None,
    signup_from: str | None = None,
    signup_to: str | None = None,
    has_subscription: bool | None = None,
    has_failed_payments: bool | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    query = db.query(User).filter(User.role == UserAppRole.MEMBER)
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(User.email).like(term),
                func.lower(func.coalesce(User.full_name, "")).like(term),
            )
        )
    if signup_from:
        try:
            query = query.filter(User.created_at >= datetime.fromisoformat(signup_from))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid signup_from")
    if signup_to:
        try:
            query = query.filter(User.created_at <= datetime.fromisoformat(signup_to))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid signup_to")
    members = query.order_by(User.created_at.desc()).all()

    if has_subscription is not None:
        active_ids = {
            uid
            for (uid,) in db.query(Subscription.user_id)
            .filter(Subscription.status.in_(["active", "trialing", "past_due", "canceling"]))
            .all()
        }
        members = [c for c in members if (c.id in active_ids) == has_subscription]
    if has_failed_payments is not None:
        failed_ids = {
            uid
            for (uid,) in db.query(Payment.user_id)
            .filter(Payment.status == PaymentStatus.FAILED)
            .all()
        }
        members = [c for c in members if (c.id in failed_ids) == has_failed_payments]
    if not members:
        return []

    user_ids = [member.id for member in members]
    booking_counts = {
        user_id: count
        for user_id, count in (
            db.query(Booking.user_id, func.count(Booking.id))
            .filter(Booking.user_id.in_(user_ids))
            .group_by(Booking.user_id)
            .all()
        )
    }
    payment_counts = {
        user_id: count
        for user_id, count in (
            db.query(Payment.user_id, func.count(Payment.id))
            .filter(Payment.user_id.in_(user_ids))
            .group_by(Payment.user_id)
            .all()
        )
    }
    subscription_counts = {
        user_id: count
        for user_id, count in (
            db.query(Subscription.user_id, func.count(Subscription.id))
            .filter(Subscription.user_id.in_(user_ids))
            .group_by(Subscription.user_id)
            .all()
        )
    }
    return [
        {
            "public_id": member.public_id,
            "email": member.email,
            "name": _user_label(member),
            "is_active": member.is_active,
            "email_verified": member.email_verified,
            "bookings": booking_counts.get(member.id, 0),
            "payments": payment_counts.get(member.id, 0),
            "subscriptions": subscription_counts.get(member.id, 0),
            "created_at": member.created_at.isoformat() if member.created_at else None,
        }
        for member in members
    ]


@router.get("/admin/members/{public_id}")
def get_member_detail(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    member = db.query(User).filter(User.public_id == public_id, User.role == UserAppRole.MEMBER).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    bookings = (
        db.query(Booking)
        .filter(Booking.user_id == member.id)
        .order_by(Booking.created_at.desc())
        .limit(100)
        .all()
    )
    payments = (
        db.query(Payment)
        .filter(Payment.user_id == member.id)
        .order_by(Payment.created_at.desc())
        .limit(100)
        .all()
    )
    subscriptions = (
        db.query(Subscription)
        .filter(Subscription.user_id == member.id)
        .order_by(Subscription.created_at.desc())
        .all()
    )
    audit_logs = (
        db.query(AuditLog)
        .filter(
            or_(
                AuditLog.actor_id == member.id,
                AuditLog.acting_as_user_id == member.id,
                AuditLog.entity_public_id == member.public_id,
            )
        )
        .order_by(AuditLog.created_at.desc())
        .limit(50)
        .all()
    )

    return {
        "profile": {
            "public_id": member.public_id,
            "email": member.email,
            "name": _user_label(member),
            "role": member.role.value if member.role else None,
            "is_active": member.is_active,
            "email_verified": member.email_verified,
            "stripe_customer_id": member.stripe_customer_id,
            "created_at": member.created_at.isoformat() if member.created_at else None,
            "updated_at": member.updated_at.isoformat() if member.updated_at else None,
        },
        "bookings": [
            {
                "public_id": b.public_id,
                "status": b.status.value,
                "start_datetime": b.start_datetime.isoformat(),
                "end_datetime": b.end_datetime.isoformat(),
                "checked_in_at": b.checked_in_at.isoformat() if b.checked_in_at else None,
                "checked_out_at": b.checked_out_at.isoformat() if b.checked_out_at else None,
                "no_show": bool(b.no_show),
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in bookings
        ],
        "payments": [
            {
                "public_id": p.public_id,
                "status": p.status.value,
                "amount": p.amount,
                "stripe_payment_intent_id": p.stripe_payment_intent_id,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in payments
        ],
        "subscriptions": [
            {
                "public_id": s.public_id,
                "status": s.status,
                "start_date": s.start_date.isoformat() if s.start_date else None,
                "end_date": s.end_date.isoformat() if s.end_date else None,
                "stripe_subscription_id": s.stripe_subscription_id,
            }
            for s in subscriptions
        ],
        "audit_logs": _serialize_audit_logs(db, audit_logs),
    }


@router.get("/admin/owner-users/{public_id}")
def get_owner_user_detail(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    owner = db.query(User).filter(User.public_id == public_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")

    memberships = (
        db.query(OrganizationMember, Organization)
        .join(Organization, Organization.id == OrganizationMember.organization_id)
        .filter(OrganizationMember.user_id == owner.id)
        .all()
    )
    audit_logs = (
        db.query(AuditLog)
        .filter(
            or_(
                AuditLog.actor_id == owner.id,
                AuditLog.acting_as_user_id == owner.id,
                AuditLog.entity_public_id == owner.public_id,
            )
        )
        .order_by(AuditLog.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "profile": {
            "public_id": owner.public_id,
            "email": owner.email,
            "name": _user_label(owner),
            "role": owner.role.value if owner.role else None,
            "is_active": owner.is_active,
            "email_verified": owner.email_verified,
            "created_at": owner.created_at.isoformat() if owner.created_at else None,
        },
        "organizations": [
            {
                "organization_public_id": organization.public_id,
                "organization_name": organization.name,
                "review_status": organization.review_status.value,
                "role": membership.role.value,
                "can_override_pricing": membership.can_override_pricing,
                "is_active": membership.is_active,
            }
            for membership, organization in memberships
        ],
        "audit_logs": _serialize_audit_logs(db, audit_logs),
    }


@router.get("/admin/owner-companies")
def list_owner_companies(
    review_status: OrganizationReviewStatus | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    query = db.query(Organization)
    if review_status is not None:
        query = query.filter(Organization.review_status == review_status)
    if q:
        term = f"%{q.strip().lower()}%"
        query = query.filter(func.lower(Organization.name).like(term))
    organizations = query.order_by(Organization.created_at.desc()).all()
    if not organizations:
        return []

    org_ids = [organization.id for organization in organizations]
    owner_ids = [organization.owner_id for organization in organizations]
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(owner_ids)).all()
    }
    location_counts = {
        org_id: count
        for org_id, count in (
            db.query(Location.organization_id, func.count(Location.id))
            .filter(Location.organization_id.in_(org_ids))
            .group_by(Location.organization_id)
            .all()
        )
    }
    listing_counts = {
        org_id: count
        for org_id, count in (
            db.query(Location.organization_id, func.count(Space.id))
            .join(Space, Space.location_id == Location.id)
            .filter(Location.organization_id.in_(org_ids))
            .group_by(Location.organization_id)
            .all()
        )
    }
    review_logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "organization",
            AuditLog.entity_public_id.in_([organization.public_id for organization in organizations]),
        )
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    review_actor_ids = {log.actor_id for log in review_logs if log.actor_id is not None}
    review_actors = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(review_actor_ids)).all()
    } if review_actor_ids else {}
    review_history_by_org: dict[str, list[dict[str, object]]] = {}
    for log in review_logs:
        actor = review_actors.get(log.actor_id)
        review_history_by_org.setdefault(log.entity_public_id, []).append(
            {
                "action": log.action,
                "actor_email": actor.email if actor else None,
                "actor_name": _user_label(actor) if actor else None,
                "before_state": log.before_state,
                "after_state": log.after_state,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
        )

    return [
        {
            "public_id": organization.public_id,
            "name": organization.name,
            "review_status": organization.review_status.value,
            "review_notes": organization.review_notes,
            "reviewed_at": organization.reviewed_at.isoformat() if organization.reviewed_at else None,
            "commission_override_pct": organization.commission_override_pct,
            "stripe_connected": bool(organization.stripe_account_id),
            "owner": {
                "public_id": users.get(organization.owner_id).public_id if users.get(organization.owner_id) else None,
                "email": users.get(organization.owner_id).email if users.get(organization.owner_id) else None,
                "name": _user_label(users[organization.owner_id]) if users.get(organization.owner_id) else None,
            },
            "locations": location_counts.get(organization.id, 0),
            "listings": listing_counts.get(organization.id, 0),
            "review_history": review_history_by_org.get(organization.public_id, []),
        }
        for organization in organizations
    ]


@router.patch("/admin/owner-companies/{public_id}")
def update_owner_company(
    public_id: str,
    payload: OrganizationAdminUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, WRITE_ROLES)
    organization = db.query(Organization).filter(Organization.public_id == public_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    before = {
        "review_status": organization.review_status.value,
        "review_notes": organization.review_notes,
        "commission_override_pct": organization.commission_override_pct,
    }
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)

    if payload.review_status is not None:
        organization.review_status = payload.review_status
        organization.reviewed_by_user_id = actor_id
        organization.reviewed_at = datetime.now(timezone.utc)
    if payload.review_notes is not None:
        organization.review_notes = payload.review_notes.strip() or None
    if payload.commission_override_pct is not None:
        organization.commission_override_pct = payload.commission_override_pct

    db.add(organization)
    db.commit()
    db.refresh(organization)

    write_audit_log(
        db=db,
        actor_id=actor_id,
        action="organization_review_updated",
        entity_type="organization",
        entity_public_id=organization.public_id,
        before_state=before,
        after_state={
            "review_status": organization.review_status.value,
            "review_notes": organization.review_notes,
            "commission_override_pct": organization.commission_override_pct,
        },
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return {
        "public_id": organization.public_id,
        "review_status": organization.review_status.value,
        "review_notes": organization.review_notes,
        "commission_override_pct": organization.commission_override_pct,
    }


@router.get("/admin/owner-users")
def list_owner_users(
    q: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    rows = (
        db.query(OrganizationMember, User, Organization)
        .join(User, User.id == OrganizationMember.user_id)
        .join(Organization, Organization.id == OrganizationMember.organization_id)
        .filter(OrganizationMember.role.in_([UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF]))
        .order_by(OrganizationMember.created_at.desc())
        .all()
    )
    if q:
        term = q.strip().lower()
        rows = [
            row
            for row in rows
            if term in row[1].email.lower()
            or term in _user_label(row[1]).lower()
            or term in row[2].name.lower()
        ]
    if not rows:
        return []

    user_ids = list({user.id for _, user, _ in rows})
    location_counts = {
        user_id: count
        for user_id, count in (
            db.query(LocationAdmin.user_id, func.count(LocationAdmin.id))
            .filter(LocationAdmin.user_id.in_(user_ids))
            .group_by(LocationAdmin.user_id)
            .all()
        )
    }
    return [
        {
            "membership_public_id": membership.public_id,
            "user_public_id": user.public_id,
            "email": user.email,
            "name": _user_label(user),
            "organization_public_id": organization.public_id,
            "organization_name": organization.name,
            "organization_review_status": organization.review_status.value,
            "role": membership.role.value,
            "can_override_pricing": membership.can_override_pricing,
            "assigned_locations": location_counts.get(user.id, 0),
            "last_activity_at": user.updated_at.isoformat() if user.updated_at else None,
        }
        for membership, user, organization in rows
    ]


@router.get("/admin/listings")
def list_admin_listings(
    q: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    rows = (
        db.query(Space, Location, Organization)
        .join(Location, Location.id == Space.location_id)
        .join(Organization, Organization.id == Location.organization_id)
        .order_by(Space.created_at.desc())
        .all()
    )
    if q:
        term = q.strip().lower()
        rows = [
            row
            for row in rows
            if term in (row[0].name or "").lower()
            or term in row[1].name.lower()
            or term in row[2].name.lower()
        ]
    if not rows:
        return []

    space_ids = [space.id for space, _, _ in rows]
    booking_counts = {
        space_id: count
        for space_id, count in (
            db.query(Booking.space_id, func.count(Booking.id))
            .filter(Booking.space_id.in_(space_ids))
            .group_by(Booking.space_id)
            .all()
        )
    }
    request_counts = {
        space_id: count
        for space_id, count in (
            db.query(BookingRequest.space_id, func.count(BookingRequest.id))
            .filter(BookingRequest.space_id.in_(space_ids))
            .group_by(BookingRequest.space_id)
            .all()
        )
    }

    return [
        {
            "space_public_id": space.public_id,
            "space_name": space.name,
            "space_type": space.space_type.value,
            "visibility": space.visibility.value,
            "availability_status": space.availability_status.value,
            "location_public_id": location.public_id,
            "location_name": location.name,
            "organization_public_id": organization.public_id,
            "organization_name": organization.name,
            "organization_review_status": organization.review_status.value,
            "bookings": booking_counts.get(space.id, 0),
            "booking_requests": request_counts.get(space.id, 0),
        }
        for space, location, organization in rows
    ]


@router.get("/admin/bookings")
def list_admin_booking_activity(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    bookings = db.query(Booking).order_by(Booking.created_at.desc()).limit(25).all()
    requests = db.query(BookingRequest).order_by(BookingRequest.created_at.desc()).limit(25).all()
    booking_users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_([booking.user_id for booking in bookings])).all()
    } if bookings else {}
    request_users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_([request.user_id for request in requests])).all()
    } if requests else {}
    return {
        "bookings": [
            {
                "public_id": booking.public_id,
                "status": booking.status.value,
                "member_email": booking_users.get(booking.user_id).email if booking_users.get(booking.user_id) else None,
                "created_at": booking.created_at.isoformat() if booking.created_at else None,
            }
            for booking in bookings
        ],
        "booking_requests": [
            {
                "public_id": request.public_id,
                "status": request.status.value,
                "member_email": request_users.get(request.user_id).email if request_users.get(request.user_id) else None,
                "operator_notes": request.operator_notes,
                "created_at": request.created_at.isoformat() if request.created_at else None,
            }
            for request in requests
        ],
    }


@router.get("/admin/payments")
def list_admin_payments(
    status: PaymentStatus | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    query = db.query(Payment).order_by(Payment.created_at.desc())
    if status is not None:
        query = query.filter(Payment.status == status)
    payments = query.limit(100).all()
    if not payments:
        return {"summary": {"gmv": 0, "platform_earnings": 0, "owner_net": 0, "failed_payments": 0}, "results": []}

    user_ids = [payment.user_id for payment in payments]
    tenant_ids = [payment.tenant_id for payment in payments if payment.tenant_id is not None]
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    }
    organizations = {
        organization.id: organization
        for organization in db.query(Organization).filter(Organization.id.in_(tenant_ids)).all()
    } if tenant_ids else {}
    succeeded = [payment for payment in payments if payment.status == PaymentStatus.SUCCEEDED]
    failed_count = len([payment for payment in payments if payment.status == PaymentStatus.FAILED])
    return {
        "summary": {
            "gmv": sum(payment.amount or 0 for payment in succeeded),
            "platform_earnings": sum(payment.platform_fee_amount or 0 for payment in succeeded),
            "owner_net": sum(payment.owner_net_amount or 0 for payment in succeeded),
            "failed_payments": failed_count,
        },
        "results": [
            {
                "public_id": payment.public_id,
                "status": payment.status.value,
                "amount": payment.amount,
                "commission_rate_pct": payment.commission_rate_pct,
                "platform_fee_amount": payment.platform_fee_amount,
                "owner_net_amount": payment.owner_net_amount,
                "member_email": users.get(payment.user_id).email if users.get(payment.user_id) else None,
                "organization_name": organizations.get(payment.tenant_id).name if organizations.get(payment.tenant_id) else None,
                "created_at": payment.created_at.isoformat() if payment.created_at else None,
            }
            for payment in payments
        ],
    }


@router.get("/admin/platform-team")
def list_platform_team(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_superadmin(db, token)
    rows = (
        db.query(PlatformTeamMember, User)
        .join(User, User.id == PlatformTeamMember.user_id)
        .order_by(PlatformTeamMember.created_at.desc())
        .all()
    )
    return [
        {
            "public_id": member.public_id,
            "email": user.email,
            "name": _user_label(user),
            "role": member.role.value,
            "is_active": member.is_active,
            "invited_at": member.invited_at.isoformat() if member.invited_at else None,
            "last_login_at": member.last_login_at.isoformat() if member.last_login_at else None,
        }
        for member, user in rows
    ]


@router.post("/admin/platform-team")
def invite_platform_team_member(
    payload: PlatformTeamInviteIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor, _member = require_superadmin(db, token)
    email = normalize_email(payload.email)
    user = get_user_by_normalized_email(db, email)
    if not user:
        user = User(
            email=email,
            email_verified=False,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    platform_member = db.query(PlatformTeamMember).filter(PlatformTeamMember.user_id == user.id).first()
    created = platform_member is None
    before = None
    if not platform_member:
        platform_member = PlatformTeamMember(
            user_id=user.id,
            role=payload.role,
            is_active=True,
            invited_by=actor.id,
            invited_at=datetime.now(timezone.utc),
        )
    else:
        before = {"role": platform_member.role.value, "is_active": platform_member.is_active}
        platform_member.role = payload.role
        platform_member.is_active = True
        platform_member.invited_by = actor.id
        platform_member.invited_at = datetime.now(timezone.utc)

    db.add(platform_member)
    db.commit()
    db.refresh(platform_member)

    send_email(
        payload.email,
        "You have been invited to the Priddyspaces platform team",
        f"You were added as {payload.role.value}. Sign in or register with this email to access the admin console.",
    )
    write_audit_log(
        db=db,
        actor_id=actor.id,
        action="platform_team_member_created" if created else "platform_team_member_updated",
        entity_type="platform_team_member",
        entity_public_id=platform_member.public_id,
        before_state=before,
        after_state={"role": platform_member.role.value, "is_active": platform_member.is_active, "email": user.email},
    )
    return {
        "public_id": platform_member.public_id,
        "email": user.email,
        "role": platform_member.role.value,
        "is_active": platform_member.is_active,
    }


@router.patch("/admin/platform-team/{public_id}")
def update_platform_team_member(
    public_id: str,
    payload: PlatformTeamUpdateIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor, _member = require_superadmin(db, token)
    platform_member = db.query(PlatformTeamMember).filter(PlatformTeamMember.public_id == public_id).first()
    if not platform_member:
        raise HTTPException(status_code=404, detail="Platform team member not found")
    before = {"role": platform_member.role.value, "is_active": platform_member.is_active}
    if payload.role is not None:
        platform_member.role = payload.role
    if payload.is_active is not None:
        platform_member.is_active = payload.is_active
    db.add(platform_member)
    db.commit()
    db.refresh(platform_member)
    write_audit_log(
        db=db,
        actor_id=actor.id,
        action="platform_team_role_updated",
        entity_type="platform_team_member",
        entity_public_id=platform_member.public_id,
        before_state=before,
        after_state={"role": platform_member.role.value, "is_active": platform_member.is_active},
    )
    return {
        "public_id": platform_member.public_id,
        "role": platform_member.role.value,
        "is_active": platform_member.is_active,
    }


@router.get("/admin/settings")
def get_platform_settings(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_superadmin(db, token)
    settings = get_or_create_platform_settings(db)
    return {
        "default_owner_commission_pct": settings.default_owner_commission_pct,
    }


@router.patch("/admin/settings")
def update_platform_settings(
    payload: PlatformSettingsUpdateIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor, _member = require_superadmin(db, token)
    settings = get_or_create_platform_settings(db)
    before = {"default_owner_commission_pct": settings.default_owner_commission_pct}
    settings.default_owner_commission_pct = payload.default_owner_commission_pct
    db.add(settings)
    db.commit()
    db.refresh(settings)
    write_audit_log(
        db=db,
        actor_id=actor.id,
        action="platform_settings_updated",
        entity_type="platform_settings",
        entity_public_id=settings.public_id,
        before_state=before,
        after_state={"default_owner_commission_pct": settings.default_owner_commission_pct},
    )
    return {
        "default_owner_commission_pct": settings.default_owner_commission_pct,
    }


@router.get("/admin/audit-logs")
def list_audit_logs(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()
    return _serialize_audit_logs(db, logs)


@router.post("/admin/impersonation/start")
def start_impersonation(
    payload: ImpersonationStartIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor, platform_member = require_platform_roles(db, token, READ_ROLES)
    target = get_user_for_token_subject(db, payload.user_public_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    ensure_not_platform_target(db, target)
    if target.role not in {UserAppRole.MEMBER, UserAppRole.OWNER}:
        raise HTTPException(status_code=400, detail="Only member and owner-side users can be impersonated")

    impersonation_token = issue_impersonation_token(
        actor=actor,
        actor_platform_member=platform_member,
        target=target,
        reason=payload.reason,
    )
    write_audit_log(
        db=db,
        actor_id=actor.id,
        action="impersonation_started",
        entity_type="user",
        entity_public_id=target.public_id,
        before_state=None,
        after_state={"reason": payload.reason, "target_email": target.email},
        acting_as_user_id=target.id,
        context={"actor_email": actor.email},
    )
    return {
        "access_token": impersonation_token,
        "default_route": build_default_route(
            app_role=target.role,
            platform_role=platform_member.role,
            impersonating=True,
        ),
    }


@router.post("/admin/impersonation/stop")
def stop_impersonation(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor, platform_member = require_platform_roles(db, token, READ_ROLES)
    effective = get_effective_user(db, token)
    standard_token = issue_standard_token(actor)
    write_audit_log(
        db=db,
        actor_id=actor.id,
        action="impersonation_stopped",
        entity_type="user",
        entity_public_id=effective.public_id,
        before_state={"target_email": effective.email},
        after_state=None,
        acting_as_user_id=effective.id if effective.id != actor.id else None,
        context={"actor_email": actor.email},
    )
    return {
        "access_token": standard_token,
        "default_route": build_default_route(
            app_role=actor.role,
            platform_role=platform_member.role,
            impersonating=False,
        ),
    }
