from __future__ import annotations

import argparse
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.password import hash_password
from app.db.session import SessionLocal
from app.models.enums import (
    AvailabilityStatus,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.location_amenity import LocationAmenity
from app.models.organization import Organization
from app.models.organization_amenity import OrganizationAmenity
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.space_image import SpaceImage
from app.models.user import User
from app.services.amenities import seed_default_amenities


DEFAULT_OWNER_PASSWORD = "OwnerDemo123!"

DEMO_ORGS: list[dict[str, Any]] = [
    {
        "owner": {
            "email": "owner.nyc@priddyspaces.demo",
            "first_name": "Ava",
            "last_name": "Miller",
        },
        "organization": {
            "name": "Skyline Works NYC",
            "branding": "Premium coworking in Manhattan for startups and hybrid teams.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": 12,
        },
        "locations": [
            {
                "name": "Nomad Hub",
                "address": "115 W 30th St",
                "city": "New York",
                "state": "NY",
                "postal_code": "10001",
                "neighborhood": "Nomad",
                "timezone": "America/New_York",
                "lat": 40.7484,
                "lng": -73.9889,
                "amenities": ["WiFi", "Coffee", "Printer", "Whiteboard"],
                "spaces": [
                    {
                        "name": "Open Desk A1",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 45,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                    {
                        "name": "Hudson Boardroom",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 8,
                        "price_daily": 180,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                    {
                        "name": "Private Office 401",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 4,
                        "price_monthly": 2400,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                ],
            },
            {
                "name": "Brooklyn Loft",
                "address": "55 Washington St",
                "city": "Brooklyn",
                "state": "NY",
                "postal_code": "11201",
                "neighborhood": "DUMBO",
                "timezone": "America/New_York",
                "lat": 40.7033,
                "lng": -73.9891,
                "amenities": ["WiFi", "Coffee", "Parking"],
                "spaces": [
                    {
                        "name": "Loft Desk 12",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 39,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                    {
                        "name": "Bridge Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 6,
                        "price_daily": 140,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                ],
            },
        ],
    },
    {
        "owner": {
            "email": "owner.miami@priddyspaces.demo",
            "first_name": "Leo",
            "last_name": "Garcia",
        },
        "organization": {
            "name": "Harbor Collective Miami",
            "branding": "Sunlit desks and meeting suites near Brickell.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "Brickell Commons",
                "address": "200 Brickell Ave",
                "city": "Miami",
                "state": "FL",
                "postal_code": "33131",
                "neighborhood": "Brickell",
                "timezone": "America/New_York",
                "lat": 25.7616,
                "lng": -80.1918,
                "amenities": ["WiFi", "Coffee", "Parking", "Meeting Room"],
                "spaces": [
                    {
                        "name": "Brickell Day Pass",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 49,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                    {
                        "name": "Bayview Suite",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 5,
                        "price_monthly": 2800,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                    {
                        "name": "Ocean Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 10,
                        "price_daily": 210,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                ],
            }
        ],
    },
    {
        "owner": {
            "email": "owner.pending@priddyspaces.demo",
            "first_name": "Nina",
            "last_name": "Patel",
        },
        "organization": {
            "name": "Launchpad Labs Austin",
            "branding": "Pending owner company for admin approval testing.",
            "review_status": OrganizationReviewStatus.PENDING,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "South Congress Lab",
                "address": "1401 S Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78704",
                "neighborhood": "South Congress",
                "timezone": "America/Chicago",
                "lat": 30.2493,
                "lng": -97.7495,
                "amenities": ["WiFi", "Coffee", "Whiteboard"],
                "spaces": [
                    {
                        "name": "Launch Desk 01",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 35,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                    {
                        "name": "Investor Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 6,
                        "price_daily": 125,
                        "visibility": SpaceVisibility.PUBLIC,
                    },
                ],
            }
        ],
    },
]


def _slug(text: str) -> str:
    return "-".join(text.lower().split())


def _reviewer_user_id(db: Session) -> int | None:
    member = db.query(PlatformTeamMember).filter(PlatformTeamMember.is_active.is_(True)).first()
    return member.user_id if member else None


def _upsert_user(
    db: Session,
    *,
    email: str,
    first_name: str,
    last_name: str,
    password: str,
) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
    user.first_name = first_name
    user.last_name = last_name
    user.full_name = f"{first_name} {last_name}".strip()
    user.role = UserAppRole.OWNER
    user.email_verified = True
    user.is_active = True
    user.password_hash = hash_password(password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _upsert_org(
    db: Session,
    *,
    owner: User,
    name: str,
    branding: str | None,
    review_status: OrganizationReviewStatus,
    commission_override_pct: int | None,
    reviewer_user_id: int | None,
) -> Organization:
    org = db.query(Organization).filter(Organization.owner_id == owner.id, Organization.name == name).first()
    if not org:
        org = Organization(name=name, owner_id=owner.id)
    org.name = name
    org.owner_id = owner.id
    org.branding = branding
    org.review_status = review_status
    org.commission_override_pct = commission_override_pct
    if review_status == OrganizationReviewStatus.APPROVED:
        org.reviewed_by_user_id = reviewer_user_id
        org.reviewed_at = datetime.now(timezone.utc)
        org.review_notes = "Seeded approved demo owner"
    elif review_status == OrganizationReviewStatus.PENDING:
        org.reviewed_by_user_id = None
        org.reviewed_at = None
        org.review_notes = "Seeded pending demo owner for approval queue"
    else:
        org.reviewed_by_user_id = reviewer_user_id
        org.reviewed_at = datetime.now(timezone.utc)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ensure_owner_membership(db: Session, *, org: Organization, owner: User) -> None:
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == owner.id,
        )
        .first()
    )
    if not member:
        member = OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            can_override_pricing=True,
            is_active=True,
        )
    else:
        member.tenant_id = org.id
        member.role = UserRole.OWNER
        member.can_override_pricing = True
        member.is_active = True
    db.add(member)
    db.commit()


def _upsert_location(db: Session, *, org: Organization, payload: dict[str, Any]) -> Location:
    location = (
        db.query(Location)
        .filter(Location.organization_id == org.id, Location.name == payload["name"])
        .first()
    )
    if not location:
        location = Location(organization_id=org.id, tenant_id=org.id, name=payload["name"], address=payload["address"], timezone=payload["timezone"])
    location.organization_id = org.id
    location.tenant_id = org.id
    location.name = payload["name"]
    location.address = payload["address"]
    location.city = payload["city"]
    location.state = payload["state"]
    location.postal_code = payload["postal_code"]
    location.neighborhood = payload["neighborhood"]
    location.timezone = payload["timezone"]
    location.lat = payload["lat"]
    location.lng = payload["lng"]
    location.status = LocationStatus.ACTIVE
    location.public_email = f"hello@{_slug(org.name)}.demo"
    location.public_phone = "(555) 010-2026"
    location.public_hours_weekdays = "Monday - Friday • 8:00 AM to 6:00 PM"
    location.public_hours_weekends = "Saturday • 10:00 AM to 2:00 PM"
    location.public_parking_notes = "Paid garage parking available nearby"
    location.public_transit_notes = "Close to downtown transit stops"
    location.public_included_items = "WiFi\nCoffee\nOnsite support"
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


def _ensure_location_amenities(
    db: Session,
    *,
    org: Organization,
    location: Location,
    amenity_names: list[str],
) -> None:
    seed_default_amenities(db, org.id)
    db.commit()
    amenity_map = {
        amenity.name.lower(): amenity
        for amenity in db.query(OrganizationAmenity)
        .filter(
            OrganizationAmenity.organization_id == org.id,
            OrganizationAmenity.deleted_at.is_(None),
        )
        .all()
    }
    for amenity_name in amenity_names:
        amenity = amenity_map.get(amenity_name.lower())
        if not amenity:
            amenity = OrganizationAmenity(
                organization_id=org.id,
                name=amenity_name,
                slug=_slug(amenity_name),
            )
            db.add(amenity)
            db.commit()
            db.refresh(amenity)
            amenity_map[amenity_name.lower()] = amenity
        link = (
            db.query(LocationAmenity)
            .filter(
                LocationAmenity.location_id == location.id,
                LocationAmenity.organization_amenity_id == amenity.id,
            )
            .first()
        )
        if not link:
            db.add(LocationAmenity(location_id=location.id, organization_amenity_id=amenity.id))
    db.commit()


def _upsert_space(
    db: Session,
    *,
    org: Organization,
    location: Location,
    payload: dict[str, Any],
) -> Space:
    space = db.query(Space).filter(Space.location_id == location.id, Space.name == payload["name"]).first()
    if not space:
        space = Space(location_id=location.id, tenant_id=org.id, name=payload["name"], space_type=payload["space_type"])
    space.location_id = location.id
    space.tenant_id = org.id
    space.name = payload["name"]
    space.space_type = payload["space_type"]
    space.capacity = payload["capacity"]
    space.price_daily = payload.get("price_daily")
    space.price_monthly = payload.get("price_monthly")
    space.visibility = payload["visibility"]
    space.availability_status = AvailabilityStatus.AVAILABLE
    space.amenities = "WiFi, Coffee, Community"
    db.add(space)
    db.commit()
    db.refresh(space)
    return space


def _ensure_space_image(db: Session, *, org: Organization, space: Space) -> None:
    image = (
        db.query(SpaceImage)
        .filter(SpaceImage.space_id == space.id, SpaceImage.is_primary.is_(True))
        .first()
    )
    if image:
        return
    slug = _slug(f"{org.name}-{space.name}")
    db.add(
        SpaceImage(
            tenant_id=org.id,
            space_id=space.id,
            image_url=f"https://placehold.co/1200x800/png?text={slug}",
            storage_key=f"seed/{slug}.png",
            is_primary=True,
            sort_order=0,
        )
    )
    db.commit()


def seed_demo_data(db: Session, *, owner_password: str) -> dict[str, int]:
    reviewer_user_id = _reviewer_user_id(db)
    counts = {"owners": 0, "organizations": 0, "locations": 0, "spaces": 0}
    for demo_org in DEMO_ORGS:
        owner = _upsert_user(db, password=owner_password, **demo_org["owner"])
        counts["owners"] += 1

        org = _upsert_org(
            db,
            owner=owner,
            reviewer_user_id=reviewer_user_id,
            **demo_org["organization"],
        )
        counts["organizations"] += 1
        _ensure_owner_membership(db, org=org, owner=owner)

        for location_payload in demo_org["locations"]:
            location = _upsert_location(db, org=org, payload=location_payload)
            counts["locations"] += 1
            _ensure_location_amenities(db, org=org, location=location, amenity_names=location_payload["amenities"])
            for space_payload in location_payload["spaces"]:
                space = _upsert_space(db, org=org, location=location, payload=space_payload)
                counts["spaces"] += 1
                if space.visibility == SpaceVisibility.PUBLIC:
                    _ensure_space_image(db, org=org, space=space)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed demo owners and listings")
    parser.add_argument(
        "--owner-password",
        default=DEFAULT_OWNER_PASSWORD,
        help="Password assigned to all seeded owner accounts",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        counts = seed_demo_data(db, owner_password=args.owner_password)
    finally:
        db.close()

    print("Seeded demo owners and listings")
    print(f"Owner password: {args.owner_password}")
    print("Owners:")
    for demo_org in DEMO_ORGS:
        print(f"  - {demo_org['owner']['email']} ({demo_org['organization']['name']})")
    print(
        f"Summary: owners={counts['owners']} organizations={counts['organizations']} "
        f"locations={counts['locations']} spaces={counts['spaces']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
