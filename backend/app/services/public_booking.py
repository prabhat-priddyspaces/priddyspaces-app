"""Public-surface booking guards shared by the booking-requests router and the
membership-requests service. Kept standalone so both can import it without a
cycle.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.enums import LocationStatus, SpaceVisibility
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.services.platform_auth import organization_is_publicly_visible


def require_public_booking_space(
    db: Session,
    space: Space,
    location: Location,
    *,
    allow_unlisted: bool,
) -> Organization:
    organization = db.query(Organization).filter(Organization.id == location.organization_id).first()
    allowed_visibility = {SpaceVisibility.PUBLIC}
    if allow_unlisted:
        allowed_visibility.add(SpaceVisibility.UNLISTED)
    if (
        space.visibility not in allowed_visibility
        or location.status != LocationStatus.ACTIVE
        or not organization_is_publicly_visible(organization)
    ):
        raise HTTPException(status_code=404, detail="Space not found")
    return organization
