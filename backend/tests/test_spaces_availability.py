from datetime import time

from app.models.enums import UserAppRole, UserRole, SpaceType
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space


def _seed_owner_location(db):
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Owner Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db.add(member)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        city="Testville",
        timezone="UTC"
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    return owner, location


def test_space_availability_hours(db_session, client_factory):
    owner, location = _seed_owner_location(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    created = client.post(
        "/api/spaces",
        json={
            "location_public_id": location.public_id,
            "space_type": SpaceType.CONFERENCE_ROOM.value,
            "capacity": 6,
            "availability_start_time": time(9, 0).isoformat(),
            "availability_end_time": time(18, 0).isoformat(),
            "visibility": "public",
            "amenities": "WiFi, Whiteboard"
        }
    )
    assert created.status_code == 200
    data = created.json()
    assert data["name"] == "Conference Room"
    assert data["availability_start_time"] == "09:00:00"
    assert data["availability_end_time"] == "18:00:00"
    assert data["visibility"] == "public"
    assert data["amenities"] == "WiFi, Whiteboard"

    fetched = client.get(f"/api/spaces/{data['public_id']}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Conference Room"
    assert fetched.json()["availability_start_time"] == "09:00:00"


def test_space_visibility_enum_uses_database_values():
    assert list(Space.__table__.c.visibility.type.enums) == ["public", "unlisted", "private"]
