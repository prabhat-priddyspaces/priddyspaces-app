from app.models.enums import UserAppRole, UserRole
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember


def test_list_my_orgs(db_session, client_factory):
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    org = Organization(name="Org", owner_id=owner.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db_session.add(member)
    db_session.commit()

    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    resp = client.get("/api/orgs")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["public_id"] == org.public_id
