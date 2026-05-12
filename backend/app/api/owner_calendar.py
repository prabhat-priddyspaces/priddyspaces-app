from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import SpaceType, UserAppRole, UserRole
from app.models.location import Location
from app.models.space import Space
from app.schemas.calendar import CalendarResponse
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids
from app.services.calendar_events import build_calendar_events

router = APIRouter()


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


@router.get("/owner/calendar", response_model=CalendarResponse)
def owner_calendar(
    start: datetime = Query(..., description="Window start (ISO 8601)"),
    end: datetime = Query(..., description="Window end (ISO 8601)"),
    location_public_id: Optional[str] = Query(None),
    space_type: list[str] | None = Query(None),
    space_public_id: list[str] | None = Query(None),
    status: list[str] | None = Query(None, description="Prefixed status filter (e.g. 'booking.confirmed')"),
    include: Optional[str] = Query(None, description="Comma-separated subset of bookings,requests,subscriptions"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role == UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Owner role required")

    loc_ids = accessible_location_ids(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if not loc_ids:
        return CalendarResponse(start=start, end=end, events=[], spaces=[], truncated=False)

    if location_public_id:
        location = db.query(Location).filter(Location.public_id == location_public_id).first()
        if not location or location.id not in loc_ids:
            raise HTTPException(status_code=404, detail="Location not found")
        loc_ids = {location.id}

    space_id_set: set[int] | None = None
    if space_public_id:
        spaces = (
            db.query(Space)
            .filter(Space.public_id.in_(space_public_id), Space.location_id.in_(loc_ids))
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
        location_ids=loc_ids,
        start=start,
        end=end,
        space_types=_parse_space_types(space_type),
        space_ids=space_id_set,
        statuses=statuses_set,
        include=include_set,
    )
