"""Clerk webhook handler — syncs Clerk identity events to Postgres.

Endpoint: POST /webhooks/clerk
All events are idempotent UPSERTs; duplicate deliveries return 200.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.models.audit_log import AuditLog
from app.models.enums import OrganizationReviewStatus, PlatformTeamRole, UserAppRole, UserRole
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


def _verify_svix(request: Request, body: bytes) -> dict[str, Any]:
    """Verify the svix webhook signature. Raises 401 on failure."""
    if not settings.CLERK_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="CLERK_WEBHOOK_SECRET not configured")
    try:
        from svix.webhooks import Webhook, WebhookVerificationError  # type: ignore[import]
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="svix package not installed") from exc

    headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    try:
        wh = Webhook(settings.CLERK_WEBHOOK_SECRET)
        return wh.verify(body, headers)  # type: ignore[arg-type]
    except Exception as exc:
        logger.warning("Clerk webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid webhook signature") from exc


def _primary_email(data: dict) -> tuple[str, bool]:
    """Return (email, email_verified) from Clerk user data."""
    primary_id = data.get("primary_email_address_id")
    for ea in data.get("email_addresses", []):
        if ea.get("id") == primary_id:
            verified = ea.get("verification", {}).get("status") == "verified"
            return ea["email_address"].lower(), verified
    # Fallback: first email address
    if data.get("email_addresses"):
        ea = data["email_addresses"][0]
        return ea["email_address"].lower(), False
    return "", False


def _map_clerk_role_to_user_role(clerk_role: str) -> UserRole:
    """Map Clerk org role slug (org:admin, org:member, admin, member) to UserRole."""
    if "admin" in clerk_role:
        return UserRole.ADMIN
    return UserRole.CUSTOMER


def _write_audit(db: Session, action: str, entity_type: str, entity_id: str, meta: dict | None = None) -> None:
    log = AuditLog(
        actor_id=0,  # system actor for webhook-driven events
        action=action,
        entity_type=entity_type,
        entity_public_id=entity_id,
        context=meta or {},
    )
    db.add(log)


# ─── User handlers ────────────────────────────────────────────────────────────

def _handle_user_upsert(db: Session, data: dict) -> None:
    clerk_id: str = data["id"]
    email, email_verified = _primary_email(data)
    if not email:
        logger.warning("Clerk user %s has no email — skipping", clerk_id)
        return

    first_name: str | None = data.get("first_name") or None
    last_name: str | None = data.get("last_name") or None
    full_name = " ".join(p for p in [first_name, last_name] if p).strip() or None

    meta = data.get("public_metadata", {}) or {}
    role_str: str | None = meta.get("role")
    platform_role_str: str | None = meta.get("platform_role")

    app_role: UserAppRole | None = None
    if role_str in {r.value for r in UserAppRole}:
        app_role = UserAppRole(role_str)

    platform_role: PlatformTeamRole | None = None
    if platform_role_str in {r.value for r in PlatformTeamRole}:
        platform_role = PlatformTeamRole(platform_role_str)

    # Find existing user by Clerk ID or email
    user = db.query(User).filter(User.auth_subject == clerk_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()

    now = datetime.now(timezone.utc)

    if user:
        user.auth_subject = clerk_id
        user.email = email
        user.email_verified = email_verified
        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name
        if full_name and not user.full_name:
            user.full_name = full_name
        if app_role is not None:
            user.role = app_role
    else:
        user = User(
            auth_subject=clerk_id,
            email=email,
            email_verified=email_verified,
            first_name=first_name,
            last_name=last_name,
            full_name=full_name,
            role=app_role,
            is_active=True,
            terms_accepted_at=now if app_role else None,
            privacy_policy_accepted_at=now if app_role else None,
        )
        db.add(user)
        db.flush()

    # Sync platform team membership
    if platform_role is not None:
        ptm = db.query(PlatformTeamMember).filter(PlatformTeamMember.user_id == user.id).first()
        if not ptm:
            ptm = PlatformTeamMember(
                user_id=user.id,
                role=platform_role,
                is_active=True,
                invited_at=now,
            )
            db.add(ptm)
        else:
            ptm.role = platform_role
            ptm.is_active = True

    _write_audit(db, "user.synced", "user", clerk_id, {"email": email})


def _handle_user_deleted(db: Session, data: dict) -> None:
    clerk_id: str = data["id"]
    user = db.query(User).filter(User.auth_subject == clerk_id).first()
    if not user:
        return
    user.is_active = False
    _write_audit(db, "user.deleted", "user", clerk_id)


# ─── Organization handlers ────────────────────────────────────────────────────

def _handle_org_upsert(db: Session, data: dict) -> None:
    clerk_org_id: str = data["id"]
    name: str = data.get("name", "")
    created_by_clerk_id: str | None = data.get("created_by")

    creator = None
    if created_by_clerk_id:
        creator = db.query(User).filter(User.auth_subject == created_by_clerk_id).first()

    org = db.query(Organization).filter(Organization.clerk_org_id == clerk_org_id).first()
    if org:
        org.name = name
    else:
        org = Organization(
            clerk_org_id=clerk_org_id,
            name=name,
            owner_id=creator.id if creator else 0,
            review_status=OrganizationReviewStatus.APPROVED,
            onboarding_completed=False,
        )
        db.add(org)

    _write_audit(db, "org.synced", "organization", clerk_org_id, {"name": name})


def _handle_org_deleted(db: Session, data: dict) -> None:
    clerk_org_id: str = data["id"]
    org = db.query(Organization).filter(Organization.clerk_org_id == clerk_org_id).first()
    if not org:
        return
    db.delete(org)
    _write_audit(db, "org.deleted", "organization", clerk_org_id)


# ─── Membership handlers ──────────────────────────────────────────────────────

def _handle_membership_upsert(db: Session, data: dict) -> None:
    clerk_membership_id: str = data["id"]
    clerk_org_id: str = data.get("organization", {}).get("id", "")
    clerk_user_id: str = data.get("public_user_data", {}).get("user_id", "")
    clerk_role: str = data.get("role", "org:member")

    org = db.query(Organization).filter(Organization.clerk_org_id == clerk_org_id).first()
    user = db.query(User).filter(User.auth_subject == clerk_user_id).first()
    if not org or not user:
        logger.warning(
            "Membership event for unknown org %s or user %s — skipping",
            clerk_org_id, clerk_user_id,
        )
        return

    role = _map_clerk_role_to_user_role(clerk_role)
    membership = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.clerk_membership_id == clerk_membership_id)
        .first()
    )
    if membership:
        membership.role = role
    else:
        membership = OrganizationMember(
            clerk_membership_id=clerk_membership_id,
            organization_id=org.id,
            tenant_id=org.id,
            user_id=user.id,
            role=role,
            is_active=True,
        )
        db.add(membership)

    _write_audit(db, "membership.synced", "organization_member", clerk_membership_id)


def _handle_membership_deleted(db: Session, data: dict) -> None:
    clerk_membership_id: str = data["id"]
    membership = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.clerk_membership_id == clerk_membership_id)
        .first()
    )
    if not membership:
        return
    db.delete(membership)
    _write_audit(db, "membership.deleted", "organization_member", clerk_membership_id)


# ─── Router ───────────────────────────────────────────────────────────────────

_HANDLERS = {
    "user.created": _handle_user_upsert,
    "user.updated": _handle_user_upsert,
    "user.deleted": _handle_user_deleted,
    "organization.created": _handle_org_upsert,
    "organization.updated": _handle_org_upsert,
    "organization.deleted": _handle_org_deleted,
    "organizationMembership.created": _handle_membership_upsert,
    "organizationMembership.updated": _handle_membership_upsert,
    "organizationMembership.deleted": _handle_membership_deleted,
}


@router.post("/webhooks/clerk", status_code=200)
async def clerk_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    body = await request.body()
    event = _verify_svix(request, body)

    event_type: str = event.get("type", "")
    data: dict = event.get("data", {})

    handler = _HANDLERS.get(event_type)
    if handler is None:
        return {"received": True, "action": "ignored"}

    try:
        handler(db, data)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Error handling Clerk event %s: %s", event_type, exc)
        raise HTTPException(status_code=500, detail="Webhook processing error") from exc

    return {"received": True, "action": event_type}
