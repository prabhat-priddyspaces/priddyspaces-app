from app.models.enums import UserAppRole, UserRole
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember


def _seed_org(db):
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
        receives_new_booking_email=True,
    )
    db.add(member)
    db.commit()
    return owner, org


def test_list_members(db_session, client_factory):
    owner, org = _seed_org(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    resp = client.get(f"/api/orgs/{org.public_id}/members")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["user_email"] == owner.email
    assert data[0]["receives_new_booking_email"] is True


def test_update_member_booking_email_preference(db_session, client_factory):
    owner, org = _seed_org(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    member_public_id = client.get(f"/api/orgs/{org.public_id}/members").json()[0]["public_id"]
    resp = client.patch(
        f"/api/orgs/{org.public_id}/members/{member_public_id}",
        json={"receives_new_booking_email": False},
    )
    assert resp.status_code == 200
    assert resp.json()["receives_new_booking_email"] is False

    listing = client.get(f"/api/orgs/{org.public_id}/members")
    assert listing.status_code == 200
    assert listing.json()[0]["receives_new_booking_email"] is False
