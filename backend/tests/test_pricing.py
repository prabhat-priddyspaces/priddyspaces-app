from datetime import datetime, timezone

from app.models.enums import UserAppRole, UserRole, SpaceType, AvailabilityStatus
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space


def _seed_owner_space(db):
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

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, space


def test_pricing_rule_and_promo_tax(db_session, client_factory):
    owner, org, space = _seed_owner_space(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    rule = client.post(
        "/api/pricing-rules",
        json={
            "space_public_id": space.public_id,
            "rate_type": "daily",
            "rate_amount": 150,
            "active_from": datetime(2026, 2, 1, tzinfo=timezone.utc).isoformat()
        }
    )
    assert rule.status_code == 200

    rules = client.get(f"/api/pricing-rules?space_public_id={space.public_id}")
    assert rules.status_code == 200
    assert len(rules.json()) == 1

    promo = client.post(
        f"/api/promo-codes?organization_public_id={org.public_id}",
        json={
            "code": "WELCOME10",
            "discount_type": "percent",
            "discount_value": 10,
            "is_active": True
        }
    )
    assert promo.status_code == 200
    duplicate = client.post(
        f"/api/promo-codes?organization_public_id={org.public_id}",
        json={
            "code": "welcome10",
            "discount_type": "percent",
            "discount_value": 10,
            "is_active": True
        }
    )
    assert duplicate.status_code == 400

    owner_two = User(
        email="owner-two@example.com",
        auth_subject="sub-owner-two",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(owner_two)
    db_session.commit()
    db_session.refresh(owner_two)
    org_two = Organization(name="Owner Org Two", owner_id=owner_two.id)
    db_session.add(org_two)
    db_session.commit()
    db_session.refresh(org_two)
    db_session.add(
        OrganizationMember(
            organization_id=org_two.id,
            tenant_id=org_two.id,
            user_id=owner_two.id,
            role=UserRole.OWNER,
            can_override_pricing=True,
        )
    )
    db_session.commit()
    other_client = client_factory({
        "sub": owner_two.auth_subject,
        "email": owner_two.email,
        "email_verified": True,
    })
    other_promo = other_client.post(
        f"/api/promo-codes?organization_public_id={org_two.public_id}",
        json={
            "code": "WELCOME10",
            "discount_type": "percent",
            "discount_value": 10,
            "is_active": True
        }
    )
    assert other_promo.status_code == 200
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    promos = client.get(f"/api/promo-codes?organization_public_id={org.public_id}")
    assert promos.status_code == 200
    assert len(promos.json()) == 1

    tax = client.post(
        f"/api/tax-config?organization_public_id={org.public_id}",
        json={"rate_percent": 7.5}
    )
    assert tax.status_code == 200

    tax_get = client.get(f"/api/tax-config?organization_public_id={org.public_id}")
    assert tax_get.status_code == 200
