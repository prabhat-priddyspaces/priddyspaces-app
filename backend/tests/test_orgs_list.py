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


def test_list_my_orgs_pagination(db_session, client_factory):
    owner = User(
        email="multi-owner@example.com",
        auth_subject="sub-multi-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    orgs = []
    for i in range(3):
        org = Organization(name=f"Org {i}", owner_id=owner.id)
        db_session.add(org)
        db_session.commit()
        db_session.refresh(org)
        db_session.add(
            OrganizationMember(
                organization_id=org.id, tenant_id=org.id, user_id=owner.id, role=UserRole.OWNER
            )
        )
        orgs.append(org)
    db_session.commit()

    client = client_factory({"sub": "sub-multi-owner", "email": owner.email, "email_verified": True})

    # limit bounds the page; results are ordered by id (deterministic).
    page1 = client.get("/api/orgs?limit=2").json()
    assert [o["public_id"] for o in page1] == [orgs[0].public_id, orgs[1].public_id]

    # offset advances to the next page.
    page2 = client.get("/api/orgs?offset=2&limit=2").json()
    assert [o["public_id"] for o in page2] == [orgs[2].public_id]

    # limit is capped (over-max is rejected by validation).
    assert client.get("/api/orgs?limit=9999").status_code == 422
