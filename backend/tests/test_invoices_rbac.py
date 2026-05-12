from app.models.enums import UserAppRole, UserRole
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.invoice import Invoice


def _create_user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_org(db, owner: User, name: str) -> Organization:
    org = Organization(name=name, owner_id=owner.id)
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
    db.commit()
    return org


def test_invoices_rbac(db_session, client_factory):
    owner_one = _create_user(db_session, "owner1@example.com", "sub-owner-1", UserAppRole.OWNER)
    owner_two = _create_user(db_session, "owner2@example.com", "sub-owner-2", UserAppRole.OWNER)
    member = _create_user(db_session, "member@example.com", "sub-member-1", UserAppRole.MEMBER)

    org_one = _seed_org(db_session, owner_one, "OrgOne")
    org_two = _seed_org(db_session, owner_two, "OrgTwo")

    inv_one = Invoice(
        tenant_id=org_one.id,
        user_id=member.id,
        amount=120,
        status="issued"
    )
    inv_two = Invoice(
        tenant_id=org_two.id,
        user_id=owner_two.id,
        amount=200,
        status="issued"
    )
    db_session.add(inv_one)
    db_session.add(inv_two)
    db_session.commit()
    db_session.refresh(inv_one)

    owner_client = client_factory({
        "sub": "sub-owner-1",
        "email": "owner1@example.com",
        "email_verified": True
    })
    resp = owner_client.get("/api/invoices")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["public_id"] == inv_one.public_id

    member_client = client_factory({
        "sub": "sub-member-1",
        "email": "member@example.com",
        "email_verified": True
    })
    resp = member_client.get("/api/invoices")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
