from datetime import datetime, timezone

from app.models.enums import UserAppRole, UserRole, SpaceType, AvailabilityStatus, BookingRequestStatus
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space
from app.models.booking import Booking


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
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, space


def test_booking_request_create_and_list(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust@example.com",
        auth_subject="sub-cust",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    customer_client = client_factory({
        "sub": "sub-cust",
        "email": "cust@example.com",
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc).isoformat()
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.REQUESTED.value
    assert data["estimated_amount"] is not None

    listing = customer_client.get("/api/booking-requests")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    owner_list = owner_client.get("/api/booking-requests?status=requested")
    assert owner_list.status_code == 200
    assert len(owner_list.json()) == 1


def test_booking_request_approve_creates_booking(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust2@example.com",
        auth_subject="sub-cust-2",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    customer_client = client_factory({
        "sub": "sub-cust-2",
        "email": customer.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 2, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 2, 12, 0, tzinfo=timezone.utc).isoformat()
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    req_id = create.json()["public_id"]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200
    approved = approve.json()
    assert approved["status"] == BookingRequestStatus.APPROVED.value
    assert approved["booking_id"] is not None
    assert approved["estimated_amount"] is not None

    booking = db_session.query(Booking).filter(Booking.id == approved["booking_id"]).first()
    assert booking is not None


def test_booking_request_reject(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust3@example.com",
        auth_subject="sub-cust-3",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    customer_client = client_factory({
        "sub": "sub-cust-3",
        "email": customer.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 3, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 3, 12, 0, tzinfo=timezone.utc).isoformat()
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    req_id = create.json()["public_id"]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    reject = owner_client.post(f"/api/booking-requests/{req_id}/reject", json={"operator_notes": "no"})
    assert reject.status_code == 200
    assert reject.json()["status"] == BookingRequestStatus.REJECTED.value


def test_instant_booking_flag_auto_approves(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust4@example.com",
        auth_subject="sub-cust-4",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    flag = owner_client.post(
        "/api/feature-flags",
        json={
            "flag_key": "instant_booking_enabled",
            "flag_value": True,
            "scope_type": "space",
            "scope_public_id": space.public_id
        }
    )
    assert flag.status_code == 200

    customer_client = client_factory({
        "sub": "sub-cust-4",
        "email": customer.email,
        "email_verified": True
    })
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 4, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 4, 12, 0, tzinfo=timezone.utc).isoformat()
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.APPROVED.value
    assert data["booking_id"] is not None
