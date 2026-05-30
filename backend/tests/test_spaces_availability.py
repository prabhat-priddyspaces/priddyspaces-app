from datetime import time
from decimal import Decimal

from app.models.enums import BookingMode, UserAppRole, UserRole, SpaceType
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.membership_plan import MembershipPlan
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.space_image import SpaceImage
from app.models.space_volume_discount import SpaceVolumeDiscount


def _seed_owner_location(db):
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
    return owner, location


def test_space_availability_hours(db_session, client_factory):
    owner, location = _seed_owner_location(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    created = client.post(
        "/api/spaces",
        json={
            "location_public_id": location.public_id,
            "space_type": SpaceType.CONFERENCE_ROOM.value,
            "capacity": 6,
            "availability_start_time": time(9, 0).isoformat(),
            "availability_end_time": time(18, 0).isoformat(),
            "visibility": "public",
            "amenities": "WiFi, Whiteboard",
            "price_hourly": "19.99",
            "price_daily": "200",
            "price_monthly": "3000.99",
        }
    )
    assert created.status_code == 200
    data = created.json()
    assert data["name"] == "Conference Room"
    assert data["availability_start_time"] == "09:00:00"
    assert data["availability_end_time"] == "18:00:00"
    assert data["visibility"] == "public"
    assert data["amenities"] == "WiFi, Whiteboard"
    assert data["price_hourly"] == "19.99"
    assert data["price_daily"] == "200.00"
    assert data["price_monthly"] == "3000.99"

    space = db_session.query(Space).filter(Space.public_id == data["public_id"]).first()
    assert space.price_hourly == Decimal("19.99")
    assert space.price_daily == Decimal("200.00")
    assert space.price_monthly == Decimal("3000.99")

    fetched = client.get(f"/api/spaces/{data['public_id']}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Conference Room"
    assert fetched.json()["availability_start_time"] == "09:00:00"
    assert fetched.json()["price_hourly"] == "19.99"


def test_space_visibility_enum_uses_database_values():
    assert list(Space.__table__.c.visibility.type.enums) == ["public", "unlisted", "private"]


def test_duplicate_space_copies_product_configuration(db_session, client_factory):
    owner, location = _seed_owner_location(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    source = Space(
        location_id=location.id,
        tenant_id=location.organization_id,
        name="Office 401",
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=4,
        price_monthly=Decimal("3000"),
        price_daily=Decimal("250"),
        price_hourly=Decimal("75"),
        availability_start_time=time(9, 0),
        availability_end_time=time(17, 0),
        buffer_before_minutes=15,
        buffer_after_minutes=30,
        priddy_points_enabled=False,
        owner_points_enabled=True,
    )
    db_session.add(source)
    db_session.flush()
    db_session.add_all([
        SpaceBookingMode(
            tenant_id=location.organization_id,
            space_id=source.id,
            booking_mode=BookingMode.PRIVATE_OFFICE_LEASE.value,
            is_enabled=True,
        ),
        MembershipPlan(
            tenant_id=location.organization_id,
            organization_id=location.organization_id,
            space_id=source.id,
            booking_mode=BookingMode.PRIVATE_OFFICE_LEASE.value,
            name="12-month Term",
            price_cents=400000,
            commitment_months=12,
            seats_per_plan=4,
            max_active_subscriptions=1,
        ),
        SpaceVolumeDiscount(
            organization_id=location.organization_id,
            tenant_id=location.organization_id,
            space_id=source.id,
            min_hours=4,
            discount_percent=10,
        ),
        SpaceImage(
            tenant_id=location.organization_id,
            space_id=source.id,
            image_url="https://images.example.com/office.jpg",
            storage_key="spaces/office.jpg",
            is_primary=True,
            sort_order=0,
        ),
    ])
    db_session.commit()
    db_session.refresh(source)

    response = client.post(f"/api/spaces/{source.public_id}/duplicate")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["name"] == "COPY of Office 401"
    assert data["space_type"] == SpaceType.PRIVATE_OFFICE.value
    assert data["capacity"] == 4
    assert data["price_monthly"] == "3000.00"
    assert data["price_hourly"] == "75.00"
    assert data["priddy_points_enabled"] is False
    assert data["owner_points_enabled"] is True

    duplicate = db_session.query(Space).filter(Space.public_id == data["public_id"]).one()
    assert duplicate.id != source.id
    assert db_session.query(SpaceBookingMode).filter_by(space_id=duplicate.id).count() == 1
    copied_plan = db_session.query(MembershipPlan).filter_by(space_id=duplicate.id).one()
    assert copied_plan.name == "12-month Term"
    assert copied_plan.price_cents == 400000
    assert db_session.query(SpaceVolumeDiscount).filter_by(space_id=duplicate.id).count() == 1
    copied_image = db_session.query(SpaceImage).filter_by(space_id=duplicate.id).one()
    assert copied_image.image_url == "https://images.example.com/office.jpg"
