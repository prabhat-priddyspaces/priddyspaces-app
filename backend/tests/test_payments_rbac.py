from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.models.enums import UserAppRole, UserRole, BookingStatus, PaymentStatus, AvailabilityStatus, SpaceType
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space
from app.models.booking import Booking
from app.models.payment import Payment


def _create_user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_tenant(db, owner: User, name: str):
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

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name=f"{name} HQ",
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
        name=f"{name} Board Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return org, location, space


def test_payments_rbac_list_and_get(db_session, client_factory):
    owner_one = _create_user(db_session, "owner1@example.com", "sub-owner-1", UserAppRole.OWNER)
    owner_two = _create_user(db_session, "owner2@example.com", "sub-owner-2", UserAppRole.OWNER)
    member = _create_user(db_session, "member@example.com", "sub-member-1", UserAppRole.MEMBER)

    org_one, _loc_one, space_one = _seed_tenant(db_session, owner_one, "OrgOne")
    org_two, _loc_two, space_two = _seed_tenant(db_session, owner_two, "OrgTwo")

    booking_one = Booking(
        user_id=member.id,
        space_id=space_one.id,
        tenant_id=org_one.id,
        start_datetime=datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.PENDING
    )
    db_session.add(booking_one)
    db_session.commit()
    db_session.refresh(booking_one)

    payment_one = Payment(
        user_id=member.id,
        booking_id=booking_one.id,
        tenant_id=org_one.id,
        amount=2000,
        provider="stripe",
        status=PaymentStatus.REQUIRES_PAYMENT
    )
    db_session.add(payment_one)

    payment_two = Payment(
        user_id=owner_two.id,
        booking_id=None,
        tenant_id=org_two.id,
        amount=3000,
        provider="stripe",
        status=PaymentStatus.REQUIRES_PAYMENT
    )
    db_session.add(payment_two)
    db_session.commit()
    db_session.refresh(payment_one)
    db_session.refresh(payment_two)

    owner_client = client_factory({
        "sub": "sub-owner-1",
        "email": "owner1@example.com",
        "email_verified": True
    })
    resp = owner_client.get("/api/payments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["public_id"] == payment_one.public_id
    assert data[0]["booking_public_id"] == booking_one.public_id
    assert data[0]["space_name"] == "OrgOne Board Room"
    assert data[0]["location_name"] == "OrgOne HQ"

    other_owner_client = client_factory({
        "sub": "sub-owner-2",
        "email": "owner2@example.com",
        "email_verified": True
    })
    resp = other_owner_client.get(f"/api/payments/{payment_one.public_id}")
    assert resp.status_code == 404

    member_client = client_factory({
        "sub": "sub-member-1",
        "email": "member@example.com",
        "email_verified": True
    })
    resp = member_client.get("/api/payments")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["public_id"] == payment_one.public_id
    assert data[0]["space_name"] == "OrgOne Board Room"
