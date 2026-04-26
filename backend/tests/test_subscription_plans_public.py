from app.models.enums import UserAppRole, UserRole, SpaceType, BillingCycle, LocationStatus, SpaceVisibility
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space
from app.models.subscription_plan import SubscriptionPlan


def _seed_public_space_with_plan(db):
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
        can_override_pricing=True
    )
    db.add(member)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        city="Testville",
        timezone="UTC",
        status=LocationStatus.ACTIVE
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.SHARED_DESK,
        capacity=4,
        visibility=SpaceVisibility.PUBLIC
    )
    db.add(space)
    db.commit()
    db.refresh(space)

    plan = SubscriptionPlan(
        organization_id=org.id,
        tenant_id=org.id,
        name="Monthly Desk",
        space_type=SpaceType.SHARED_DESK,
        billing_cycle=BillingCycle.MONTHLY,
        price=199,
        is_active=True
    )
    db.add(plan)
    db.commit()
    return space


def test_public_subscription_plans(db_session, client_factory):
    space = _seed_public_space_with_plan(db_session)
    client = client_factory({"sub": "sub-owner", "email": "owner@example.com", "email_verified": True})

    resp = client.get(f"/api/subscription-plans/public?space_public_id={space.public_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Monthly Desk"
