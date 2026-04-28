from datetime import datetime, timezone

from app.models.enums import UserAppRole, UserRole, SpaceType, AvailabilityStatus, BookingStatus
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space
from app.models.booking import Booking


def _seed_booking(db):
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

    customer = User(
        email="cust@example.com",
        auth_subject="sub-cust",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)

    booking = Booking(
        user_id=customer.id,
        space_id=space.id,
        tenant_id=org.id,
        start_datetime=datetime(2099, 2, 5, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2099, 2, 5, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return owner, customer, org, space, booking


def test_cancellation_policy_and_cancel(db_session, client_factory):
    owner, customer, org, space, booking = _seed_booking(db_session)
    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    policy = owner_client.post(
        f"/api/cancellation-policies?organization_public_id={org.public_id}",
        json={"space_type": space.space_type, "cancel_window_hours": 24, "refund_percent": 50}
    )
    assert policy.status_code == 200

    customer_client = client_factory({
        "sub": "sub-cust",
        "email": customer.email,
        "email_verified": True
    })
    cancel = customer_client.post(f"/api/bookings/{booking.public_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["refund_percent"] == 50
