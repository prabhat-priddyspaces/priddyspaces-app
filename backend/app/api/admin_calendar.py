from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import PlatformTeamRole, SpaceType
from app.models.location import Location
from app.models.organization import Organization
from app.models.org_customer import OrgCustomer
from app.models.space import Space
from app.models.user import User
from app.schemas.calendar import CalendarResponse
from app.schemas.org_customer import OrgCustomerListItem
from app.services.calendar_events import build_calendar_events
from app.services.org_customer_stats import (
    compute_member_stats,
    interacted_user_ids,
)
from app.services.platform_auth import require_platform_roles


router = APIRouter()


READ_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN, PlatformTeamRole.SUPPORT}


def _parse_space_types(values: list[str] | None) -> set[SpaceType] | None:
    if not values:
        return None
    out: set[SpaceType] = set()
    for v in values:
        try:
            out.add(SpaceType(v))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown space_type: {v}")
    return out


@router.get("/admin/calendar", response_model=CalendarResponse)
def admin_calendar(
    start: datetime = Query(...),
    end: datetime = Query(...),
    organization_public_id: Optional[str] = Query(None),
    location_public_id: Optional[str] = Query(None),
    space_type: list[str] | None = Query(None),
    space_public_id: list[str] | None = Query(None),
    status: list[str] | None = Query(None),
    include: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)

    # Resolve the location set: location > organization > all
    location_ids: set[int]
    if location_public_id:
        location = db.query(Location).filter(Location.public_id == location_public_id).first()
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        location_ids = {location.id}
    elif organization_public_id:
        org = db.query(Organization).filter(Organization.public_id == organization_public_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        location_ids = {
            row[0]
            for row in db.query(Location.id).filter(Location.organization_id == org.id).all()
        }
    else:
        location_ids = {row[0] for row in db.query(Location.id).all()}

    if not location_ids:
        return CalendarResponse(start=start, end=end, events=[], spaces=[], truncated=False)

    space_id_set: set[int] | None = None
    if space_public_id:
        spaces = (
            db.query(Space)
            .filter(Space.public_id.in_(space_public_id), Space.location_id.in_(location_ids))
            .all()
        )
        space_id_set = {s.id for s in spaces}
        if not space_id_set:
            return CalendarResponse(start=start, end=end, events=[], spaces=[], truncated=False)

    include_set: set[str] | None = None
    if include:
        include_set = {part.strip() for part in include.split(",") if part.strip()}

    statuses_set = set(status) if status else None

    return build_calendar_events(
        db,
        location_ids=location_ids,
        start=start,
        end=end,
        space_types=_parse_space_types(space_type),
        space_ids=space_id_set,
        statuses=statuses_set,
        include=include_set,
    )


@router.get("/admin/customers/{user_public_id}/orgs", response_model=list[OrgCustomerListItem])
def admin_customer_orgs(
    user_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    """Return per-org activity for a customer across every org they've interacted with."""
    require_platform_roles(db, token, READ_ROLES)

    target = db.query(User).filter(User.public_id == user_public_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")

    org_records = {
        record.organization_id: record
        for record in db.query(OrgCustomer).filter(OrgCustomer.user_id == target.id).all()
    }

    candidate_org_ids: set[int] = set(org_records.keys())
    for org in db.query(Organization).all():
        if target.id in interacted_user_ids(db, org.id):
            candidate_org_ids.add(org.id)

    if not candidate_org_ids:
        return []

    orgs_by_id = {
        org.id: org
        for org in db.query(Organization).filter(Organization.id.in_(candidate_org_ids)).all()
    }

    items: list[OrgCustomerListItem] = []
    for org_id in candidate_org_ids:
        org = orgs_by_id.get(org_id)
        if not org:
            continue
        record = org_records.get(org_id)
        stats = compute_member_stats(db, org_id, target.id)
        items.append(
            OrgCustomerListItem(
                user_public_id=target.public_id,
                organization_public_id=org.public_id,
                name=org.name,
                email=target.email or "",
                status=record.status if record else "active",
                phone=record.phone if record else None,
                company_name=record.company_name if record else None,
                tags=[],
                notes_preview=(record.notes[:140] if record and record.notes else None),
                materialized=record is not None,
                stats=_stats_passthrough(stats),
            )
        )
    def _sort_key(item: OrgCustomerListItem) -> tuple[float, str]:
        ts = item.stats.last_booking_at or item.stats.first_booking_at
        return (ts.timestamp() if ts else 0.0, item.name)

    items.sort(key=_sort_key, reverse=True)
    return items


def _stats_passthrough(stats):
    from app.schemas.org_customer import OrgCustomerStats

    return OrgCustomerStats(
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
