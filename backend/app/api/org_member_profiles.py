import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import UserAppRole, UserRole
from app.models.org_member_profile import OrgMemberProfile
from app.models.organization import Organization
from app.models.user import User
from app.schemas.org_member_profile import (
    OrgMemberProfileDetail,
    OrgMemberProfileListItem,
    OrgMemberProfileStats,
    OrgMemberProfileUpdate,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import list_org_members
from app.services.org_member_stats import (
    MemberStats,
    compute_member_stats,
    compute_member_stats_bulk,
    interacted_user_ids,
)

router = APIRouter()


OWNER_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}


def _accessible_orgs(db: Session, user_id: int) -> list[Organization]:
    members = list_org_members(db, user_id, OWNER_ROLES)
    org_ids = sorted({m.organization_id for m in members})
    if not org_ids:
        return []
    return db.query(Organization).filter(Organization.id.in_(org_ids)).all()


def _resolve_org(
    db: Session, user_id: int, organization_public_id: Optional[str]
) -> Organization:
    orgs = _accessible_orgs(db, user_id)
    if not orgs:
        raise HTTPException(status_code=404, detail="No accessible organization")
    if organization_public_id:
        for org in orgs:
            if org.public_id == organization_public_id:
                return org
        raise HTTPException(status_code=404, detail="Organization not found")
    if len(orgs) > 1:
        raise HTTPException(
            status_code=400, detail="organization_public_id required for multi-org owner"
        )
    return orgs[0]


def _name_for(user: User) -> str:
    return user.full_name or user.first_name or user.email or "Unknown"


def _decode_tags(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
        if isinstance(value, list):
            return [str(v) for v in value]
    except (json.JSONDecodeError, TypeError):
        pass
    # Backward-compat: comma-separated fallback.
    return [part.strip() for part in raw.split(",") if part.strip()]


def _encode_tags(tags: Optional[list[str]]) -> Optional[str]:
    if tags is None:
        return None
    cleaned = [str(t).strip() for t in tags if str(t).strip()]
    return json.dumps(cleaned) if cleaned else None


def _stats_to_schema(stats: MemberStats) -> OrgMemberProfileStats:
    return OrgMemberProfileStats(
        total_bookings=stats.total_bookings,
        confirmed_bookings=stats.confirmed_bookings,
        canceled_bookings=stats.canceled_bookings,
        no_shows=stats.no_shows,
        open_requests=stats.open_requests,
        total_revenue_cents=stats.total_revenue_cents,
        active_subscriptions=stats.active_subscriptions,
        first_booking_at=stats.first_booking_at,
        last_booking_at=stats.last_booking_at,
    )


def _materialize(
    db: Session,
    organization: Organization,
    user: User,
    actor_id: int,
) -> OrgMemberProfile:
    record = (
        db.query(OrgMemberProfile)
        .filter(
            OrgMemberProfile.organization_id == organization.id,
            OrgMemberProfile.user_id == user.id,
        )
        .first()
    )
    if record:
        return record
    record = OrgMemberProfile(
        organization_id=organization.id,
        tenant_id=organization.id,
        user_id=user.id,
        status="active",
        created_by_user_id=actor_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/owner/members", response_model=list[OrgMemberProfileListItem])
def list_members(
    organization_public_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="Filter by OrgMemberProfile.status"),
    search: Optional[str] = Query(None, description="Substring of name or email"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role == UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Owner role required")

    organization = _resolve_org(db, user.id, organization_public_id)

    interacted = interacted_user_ids(db, organization.id)
    rows: dict[int, OrgMemberProfile] = {
        record.user_id: record
        for record in db.query(OrgMemberProfile)
        .filter(OrgMemberProfile.organization_id == organization.id)
        .all()
    }
    user_id_set = interacted | set(rows.keys())
    if not user_id_set:
        return []

    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(user_id_set)).all()}
    stats_by_user = compute_member_stats_bulk(db, organization.id, user_id_set)

    out: list[OrgMemberProfileListItem] = []
    needle = search.strip().lower() if search else None
    for uid in user_id_set:
        u = users_by_id.get(uid)
        if not u:
            continue
        record = rows.get(uid)
        record_status = record.status if record else "active"
        if status and record_status != status:
            continue
        name = _name_for(u)
        if needle:
            if needle not in name.lower() and needle not in (u.email or "").lower():
                continue
        notes = record.notes if record else None
        notes_preview = notes[:140] if notes else None
        out.append(
            OrgMemberProfileListItem(
                user_public_id=u.public_id,
                organization_public_id=organization.public_id,
                name=name,
                email=u.email or "",
                status=record_status,
                phone=record.phone if record else None,
                company_name=record.company_name if record else None,
                tags=_decode_tags(record.tags) if record else [],
                notes_preview=notes_preview,
                materialized=record is not None,
                stats=_stats_to_schema(stats_by_user[uid]),
            )
        )
    def _sort_key(item: OrgMemberProfileListItem) -> tuple[float, str]:
        ts = item.stats.last_booking_at or item.stats.first_booking_at
        return (ts.timestamp() if ts else 0.0, item.name)

    out.sort(key=_sort_key, reverse=True)
    return out


@router.get("/owner/members/{user_public_id}", response_model=OrgMemberProfileDetail)
def get_member(
    user_public_id: str,
    organization_public_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = get_or_create_user(db, token)
    if actor.role == UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Owner role required")

    organization = _resolve_org(db, actor.id, organization_public_id)

    target = db.query(User).filter(User.public_id == user_public_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    interacted = interacted_user_ids(db, organization.id)
    record = (
        db.query(OrgMemberProfile)
        .filter(
            OrgMemberProfile.organization_id == organization.id,
            OrgMemberProfile.user_id == target.id,
        )
        .first()
    )
    if not record and target.id not in interacted:
        raise HTTPException(status_code=404, detail="Member not found")

    materialized = record is not None
    stats = compute_member_stats(db, organization.id, target.id)
    return OrgMemberProfileDetail(
        user_public_id=target.public_id,
        organization_public_id=organization.public_id,
        name=_name_for(target),
        email=target.email or "",
        status=record.status if record else "active",
        phone=record.phone if record else None,
        company_name=record.company_name if record else None,
        tags=_decode_tags(record.tags) if record else [],
        notes=record.notes if record else None,
        materialized=materialized,
        stats=_stats_to_schema(stats),
    )


@router.patch("/owner/members/{user_public_id}", response_model=OrgMemberProfileDetail)
def update_member(
    user_public_id: str,
    payload: OrgMemberProfileUpdate,
    organization_public_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = get_or_create_user(db, token)
    if actor.role == UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Owner role required")

    organization = _resolve_org(db, actor.id, organization_public_id)
    target = db.query(User).filter(User.public_id == user_public_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    interacted = interacted_user_ids(db, organization.id)
    record = (
        db.query(OrgMemberProfile)
        .filter(
            OrgMemberProfile.organization_id == organization.id,
            OrgMemberProfile.user_id == target.id,
        )
        .first()
    )
    if not record and target.id not in interacted:
        # Allow lazy creation only for users who have interacted with this org.
        raise HTTPException(status_code=404, detail="Member not found")
    if not record:
        record = _materialize(db, organization, target, actor.id)

    if payload.status is not None:
        if payload.status not in {"lead", "active", "churned", "blocked"}:
            raise HTTPException(status_code=400, detail="Invalid status")
        record.status = payload.status
    if payload.phone is not None:
        record.phone = payload.phone or None
    if payload.company_name is not None:
        record.company_name = payload.company_name or None
    if payload.tags is not None:
        record.tags = _encode_tags(payload.tags)
    if payload.notes is not None:
        record.notes = payload.notes or None

    db.add(record)
    db.commit()
    db.refresh(record)

    stats = compute_member_stats(db, organization.id, target.id)
    return OrgMemberProfileDetail(
        user_public_id=target.public_id,
        organization_public_id=organization.public_id,
        name=_name_for(target),
        email=target.email or "",
        status=record.status,
        phone=record.phone,
        company_name=record.company_name,
        tags=_decode_tags(record.tags),
        notes=record.notes,
        materialized=True,
        stats=_stats_to_schema(stats),
    )
