from app.models.enums import UserAppRole, UserRole, SpaceType, BillingCycle
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember


def _seed_owner(db):
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
    db.commit()
    return owner, org


def test_subscription_plan_crud(db_session, client_factory):
    owner, org = _seed_owner(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    created = client.post(
        f"/api/subscription-plans?organization_public_id={org.public_id}",
        json={
            "name": "Monthly Desk",
            "space_type": SpaceType.SHARED_DESK.value,
            "billing_cycle": BillingCycle.MONTHLY.value,
            "price": 199,
            "stripe_price_id": "price_123",
            "is_active": True
        }
    )
    assert created.status_code == 200
    public_id = created.json()["public_id"]

    listed = client.get(f"/api/subscription-plans?organization_public_id={org.public_id}")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    fetched = client.get(f"/api/subscription-plans/{public_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Monthly Desk"

    updated = client.patch(
        f"/api/subscription-plans/{public_id}",
        json={"price": 249, "is_active": False}
    )
    assert updated.status_code == 200
    assert updated.json()["price"] == 249
    assert updated.json()["is_active"] is False
