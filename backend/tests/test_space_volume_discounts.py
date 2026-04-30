from datetime import datetime, timezone
from urllib.parse import quote

from app.models.customer_owner_payment_method import CustomerOwnerPaymentMethod
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.models.space_volume_discount import SpaceVolumeDiscount
from app.models.user import User


def _seed(db) -> tuple[User, Space]:
    owner = User(
        email="vd-owner@example.com",
        auth_subject="sub-vd-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)
    org = Organization(name="VD Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)
    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
        )
    )
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="1 St",
        city="City",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Room A",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_hourly=3000,
        price_daily=20000,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, space


def _token(user: User) -> dict:
    return {"sub": user.auth_subject, "email": user.email, "email_verified": True}


def _seed_payment_method(db, customer: User, space: Space) -> CustomerOwnerPaymentMethod:
    setting = OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test",
        stripe_secret_key_encrypted="sk_test",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    method = CustomerOwnerPaymentMethod(
        user_id=customer.id,
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        owner_payment_setting_id=setting.id,
        provider_customer_id="cus_test",
        provider_payment_method_id="pm_test",
        last4="4242",
        brand="visa",
        exp_month=12,
        exp_year=2030,
        is_default_for_owner=True,
        status="active",
    )
    db.add(method)
    db.commit()
    db.refresh(method)
    return method


def test_replace_volume_discounts_creates_tiers(db_session, client_factory):
    owner, space = _seed(db_session)
    client = client_factory(_token(owner))
    resp = client.put(
        f"/api/spaces/{space.public_id}/volume-discounts",
        json={"tiers": [
            {"min_hours": 4, "discount_percent": 10},
            {"min_hours": 8, "discount_percent": 20},
        ]},
    )
    assert resp.status_code == 200
    tiers = resp.json()
    assert len(tiers) == 2
    assert tiers[0]["min_hours"] == 4
    assert tiers[1]["discount_percent"] == 20


def test_replace_is_idempotent(db_session, client_factory):
    owner, space = _seed(db_session)
    client = client_factory(_token(owner))
    client.put(
        f"/api/spaces/{space.public_id}/volume-discounts",
        json={"tiers": [{"min_hours": 4, "discount_percent": 10}]},
    )
    # Replace with a different list — old rows are deleted.
    resp = client.put(
        f"/api/spaces/{space.public_id}/volume-discounts",
        json={"tiers": [{"min_hours": 6, "discount_percent": 15}]},
    )
    assert resp.status_code == 200
    tiers = resp.json()
    assert len(tiers) == 1
    assert tiers[0]["min_hours"] == 6
    # Confirm the underlying table only has the new row.
    rows = db_session.query(SpaceVolumeDiscount).filter(SpaceVolumeDiscount.space_id == space.id).all()
    assert len(rows) == 1


def test_duplicate_min_hours_rejected(db_session, client_factory):
    owner, space = _seed(db_session)
    client = client_factory(_token(owner))
    resp = client.put(
        f"/api/spaces/{space.public_id}/volume-discounts",
        json={"tiers": [
            {"min_hours": 4, "discount_percent": 10},
            {"min_hours": 4, "discount_percent": 20},
        ]},
    )
    assert resp.status_code == 400


def test_volume_discount_applied_in_booking_estimate(db_session, client_factory):
    """End-to-end: owner sets a 4-hour/10% tier, customer books 4 hours, sees discount."""
    owner, space = _seed(db_session)
    owner_client = client_factory(_token(owner))
    owner_client.put(
        f"/api/spaces/{space.public_id}/volume-discounts",
        json={"tiers": [{"min_hours": 4, "discount_percent": 10}]},
    )

    customer = User(
        email="vd-cust@example.com",
        auth_subject="sub-vd-cust",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)

    method = _seed_payment_method(db_session, customer, space)
    cust_client = client_factory(_token(customer))
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 6, 1, 13, 0, tzinfo=timezone.utc).isoformat(),
        "customer_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
        "booking_mode": "hourly",
    }
    resp = cust_client.post("/api/booking-requests", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    # 4 hrs x $30 = $120 base, 10% off = $108. estimated_amount is dollars (cents // 100).
    assert body["base_amount_cents"] == 12000
    assert body["discount_percent"] == 10
    assert body["discount_amount_cents"] == -1200
    assert body["rate_basis"] == "hourly"


def test_full_day_booking_ignores_volume_discount(db_session, client_factory):
    owner, space = _seed(db_session)
    owner_client = client_factory(_token(owner))
    owner_client.put(
        f"/api/spaces/{space.public_id}/volume-discounts",
        json={"tiers": [{"min_hours": 1, "discount_percent": 50}]},
    )
    customer = User(
        email="vd-cust2@example.com",
        auth_subject="sub-vd-cust2",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)
    cust_client = client_factory(_token(customer))
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 6, 2, 9, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 6, 2, 11, 0, tzinfo=timezone.utc).isoformat(),
        "customer_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
        "full_day": True,
    }
    resp = cust_client.post("/api/booking-requests", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["rate_basis"] == "daily"
    assert body["base_amount_cents"] == 20000
    assert body["discount_percent"] == 0
