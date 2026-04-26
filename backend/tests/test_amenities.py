from app.models.enums import AvailabilityStatus, SpaceType, SpaceVisibility, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_amenity import OrganizationAmenity
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.user import User


def _seed_owner_org(db, *, email: str = "owner@example.com", sub: str = "sub-owner"):
    owner = User(
        email=email,
        auth_subject=sub,
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
    )
    db.add(member)
    db.commit()
    return owner, org


def test_org_creation_seeds_default_amenities(db_session, client_factory):
    client = client_factory(
        {
            "sub": "sub-create-org",
            "email": "creator@example.com",
            "email_verified": True,
        }
    )

    created = client.post("/api/orgs", json={"name": "Seeded Org"})
    assert created.status_code == 200
    org_public_id = created.json()["public_id"]

    response = client.get(f"/api/orgs/{org_public_id}/amenities")
    assert response.status_code == 200
    names = [item["name"] for item in response.json()]
    assert names == ["AC", "Coffee", "Meeting Room", "Parking", "Printer", "Whiteboard", "WiFi"]


def test_amenity_crud_and_delete_removes_location_mapping(db_session, client_factory):
    owner, org = _seed_owner_org(db_session)
    client = client_factory(
        {"sub": owner.auth_subject, "email": owner.email, "email_verified": True}
    )

    created = client.post(
        f"/api/orgs/{org.public_id}/amenities",
        json={"name": "Projector"},
    )
    assert created.status_code == 200
    amenity = created.json()

    duplicate = client.post(
        f"/api/orgs/{org.public_id}/amenities",
        json={"name": "  projector  "},
    )
    assert duplicate.status_code == 400

    location = client.post(
        "/api/locations",
        json={
            "organization_public_id": org.public_id,
            "name": "Downtown",
            "address": "100 Main",
            "city": "Austin",
            "timezone": "America/Chicago",
            "amenity_ids": [amenity["id"]],
        },
    )
    assert location.status_code == 200
    assert location.json()["amenities"] == [{"id": amenity["id"], "name": "Projector", "slug": "projector"}]

    updated = client.patch(
        f"/api/orgs/{org.public_id}/amenities/{amenity['id']}",
        json={"name": "4K Projector"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "4K Projector"

    deleted = client.delete(f"/api/orgs/{org.public_id}/amenities/{amenity['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True

    location_after_delete = client.get(f"/api/locations/{location.json()['public_id']}")
    assert location_after_delete.status_code == 200
    assert location_after_delete.json()["amenities"] == []


def test_location_rejects_cross_org_amenity_ids(db_session, client_factory):
    owner_one, org_one = _seed_owner_org(db_session, email="owner1@example.com", sub="sub-owner-1")
    owner_two, org_two = _seed_owner_org(db_session, email="owner2@example.com", sub="sub-owner-2")

    foreign_amenity = OrganizationAmenity(
        organization_id=org_two.id,
        name="Coffee",
        slug="coffee",
    )
    db_session.add(foreign_amenity)
    db_session.commit()
    db_session.refresh(foreign_amenity)

    client = client_factory(
        {"sub": owner_one.auth_subject, "email": owner_one.email, "email_verified": True}
    )

    response = client.post(
        "/api/locations",
        json={
            "organization_public_id": org_one.public_id,
            "name": "Invalid",
            "address": "100 Main",
            "city": "Austin",
            "timezone": "America/Chicago",
            "amenity_ids": [foreign_amenity.id],
        },
    )
    assert response.status_code == 400


def test_space_detail_prefers_location_amenities(db_session, client_factory):
    owner, org = _seed_owner_org(db_session)
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        city="Austin",
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    amenity = OrganizationAmenity(
        organization_id=org.id,
        name="Coffee",
        slug="coffee",
    )
    db_session.add(amenity)
    db_session.commit()
    db_session.refresh(amenity)

    client = client_factory(
        {"sub": owner.auth_subject, "email": owner.email, "email_verified": True}
    )
    updated_location = client.patch(
        f"/api/locations/{location.public_id}",
        json={"amenity_ids": [amenity.id]},
    )
    assert updated_location.status_code == 200

    created = client.post(
        "/api/spaces",
        json={
            "location_public_id": location.public_id,
            "space_type": SpaceType.CONFERENCE_ROOM.value,
            "capacity": 6,
            "visibility": SpaceVisibility.PUBLIC.value,
            "amenities": "Legacy text",
        },
    )
    assert created.status_code == 200
    assert created.json()["amenities"] == "Coffee"

    space = (
        db_session.query(Space)
        .filter(Space.public_id == created.json()["public_id"])
        .first()
    )
    assert space is not None
    assert space.availability_status == AvailabilityStatus.AVAILABLE
