from datetime import date, timedelta

from app.models.enums import (
    AvailabilityStatus,
    BillingCycle,
    BookingMode,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.subscription import Subscription
from app.models.user import User


def _seed_owner_with_space(db, *, space_type: SpaceType = SpaceType.PRIVATE_OFFICE):
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(
        name="Owner Org",
        owner_id=owner.id,
        review_status=OrganizationReviewStatus.APPROVED,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    db.add(
        OwnerPaymentSetting(
            organization_id=org.id,
            tenant_id=org.id,
            provider="stripe",
            is_enabled=True,
            stripe_publishable_key="pk_test_owner",
            stripe_secret_key_encrypted="sk_test_owner",
        )
    )
    db.commit()

    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            can_override_pricing=True,
        )
    )

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        city="Testville",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=space_type,
        capacity=4,
        visibility=SpaceVisibility.PUBLIC,
    )
    db.add(space)
    db.commit()
    db.refresh(space)

    return owner, org, location, space


def _client(client_factory):
    return client_factory(
        {"sub": "sub-owner", "email": "owner@example.com", "email_verified": True}
    )


def test_membership_plan_crud(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session)
    client = _client(client_factory)

    created = client.post(
        "/api/membership-plans",
        json={
            "space_public_id": space.public_id,
            "booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value,
            "name": "12-month Lease",
            "description": "12-month commitment with 16 hrs/mo of meeting room time",
            "price_cents": 200000,
            "billing_cycle": BillingCycle.MONTHLY.value,
            "commitment_months": 12,
            "auto_renew": True,
            "included_meeting_room_hours_per_month": 16,
            "overage_hourly_rate_cents": 5000,
            "seats_per_plan": 4,
            "max_active_subscriptions": 1,
            "is_active": True,
            "sort_order": 0,
        },
    )
    assert created.status_code == 200, created.text
    plan_public_id = created.json()["public_id"]
    assert created.json()["commitment_months"] == 12
    assert created.json()["included_meeting_room_hours_per_month"] == 16

    listed = client.get(f"/api/membership-plans?space_public_id={space.public_id}")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    fetched = client.get(f"/api/membership-plans/{plan_public_id}")
    assert fetched.status_code == 200

    updated = client.patch(
        f"/api/membership-plans/{plan_public_id}",
        json={"price_cents": 220000, "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["price_cents"] == 220000
    assert updated.json()["is_active"] is False
    assert updated.json()["stripe_price_id"] is None

    deleted = client.delete(f"/api/membership-plans/{plan_public_id}")
    assert deleted.status_code == 200
    assert deleted.json()["is_active"] is False


def test_membership_plan_rejects_mismatched_mode(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.CONFERENCE_ROOM)
    client = _client(client_factory)

    resp = client.post(
        "/api/membership-plans",
        json={
            "space_public_id": space.public_id,
            "booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value,
            "name": "wrong",
            "price_cents": 1000,
        },
    )
    assert resp.status_code == 400
    assert "not valid" in resp.json()["detail"].lower()


def test_space_booking_modes_upsert_and_list(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.SHARED_DESK)
    client = _client(client_factory)

    upsert = client.put(
        f"/api/spaces/{space.public_id}/booking-modes",
        json={"booking_mode": BookingMode.DAY_PASS.value, "is_enabled": True},
    )
    assert upsert.status_code == 200, upsert.text
    assert upsert.json()["booking_mode"] == BookingMode.DAY_PASS.value

    # Toggle off via second upsert
    upsert2 = client.put(
        f"/api/spaces/{space.public_id}/booking-modes",
        json={"booking_mode": BookingMode.DAY_PASS.value, "is_enabled": False},
    )
    assert upsert2.status_code == 200
    assert upsert2.json()["is_enabled"] is False

    listed = client.get(f"/api/spaces/{space.public_id}/booking-modes")
    assert listed.status_code == 200
    payload = listed.json()
    assert len(payload) == 1
    assert payload[0]["is_enabled"] is False


def test_space_booking_modes_rejects_invalid_combo(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.CONFERENCE_ROOM)
    client = _client(client_factory)

    resp = client.put(
        f"/api/spaces/{space.public_id}/booking-modes",
        json={"booking_mode": BookingMode.MONTHLY_MEMBERSHIP.value, "is_enabled": True},
    )
    assert resp.status_code == 400


def test_public_membership_plans_filtered_by_enabled_modes(db_session, client_factory):
    owner, org, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.PRIVATE_OFFICE)
    client = _client(client_factory)

    # Owner enables the lease mode
    client.put(
        f"/api/spaces/{space.public_id}/booking-modes",
        json={"booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value, "is_enabled": True},
    )
    client.post(
        "/api/membership-plans",
        json={
            "space_public_id": space.public_id,
            "booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value,
            "name": "12mo",
            "price_cents": 200000,
            "commitment_months": 12,
        },
    )

    public_resp = client.get(
        f"/api/membership-plans/public?space_public_id={space.public_id}"
    )
    assert public_resp.status_code == 200
    plans = public_resp.json()
    assert len(plans) == 1
    assert plans[0]["name"] == "12mo"
    assert plans[0]["booking_mode"] == BookingMode.PRIVATE_OFFICE_LEASE.value

    # Disable the mode -> public listing returns empty
    client.put(
        f"/api/spaces/{space.public_id}/booking-modes",
        json={"booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value, "is_enabled": False},
    )
    empty_resp = client.get(
        f"/api/membership-plans/public?space_public_id={space.public_id}"
    )
    assert empty_resp.status_code == 200
    assert empty_resp.json() == []


def test_public_membership_plans_hidden_when_space_unavailable(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.PRIVATE_OFFICE)
    client = _client(client_factory)

    client.post(
        "/api/membership-plans",
        json={
            "space_public_id": space.public_id,
            "booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value,
            "name": "12mo",
            "price_cents": 200000,
            "commitment_months": 12,
        },
    )

    for status in (AvailabilityStatus.OCCUPIED, AvailabilityStatus.MAINTENANCE):
        space.availability_status = status
        db_session.add(space)
        db_session.commit()

        resp = client.get(f"/api/membership-plans/public?space_public_id={space.public_id}")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Space not found"


def test_marketplace_space_detail_includes_product_booking_modes(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.SHARED_DESK)
    space.price_daily = 49
    db_session.add(space)
    db_session.commit()
    client = _client(client_factory)

    plan_resp = client.post(
        "/api/membership-plans",
        json={
            "space_public_id": space.public_id,
            "booking_mode": BookingMode.MONTHLY_MEMBERSHIP.value,
            "name": "Coworking Membership",
            "price_cents": 39900,
            "commitment_months": 1,
        },
    )
    assert plan_resp.status_code == 200, plan_resp.text

    detail = client.get(f"/api/marketplace/spaces/{space.public_id}")
    assert detail.status_code == 200, detail.text
    products = detail.json()["space"]["booking_products"]
    assert [product["booking_mode"] for product in products] == [
        BookingMode.DAY_PASS.value,
        BookingMode.MONTHLY_MEMBERSHIP.value,
    ]
    assert products[0]["label"] == "Day Pass"
    assert products[1]["membership_plan_public_id"] == plan_resp.json()["public_id"]


def test_conference_room_space_detail_includes_hourly_and_day_rate_products(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.CONFERENCE_ROOM)
    space.price_hourly = 30
    space.price_daily = 200
    db_session.add(space)
    db_session.commit()
    client = _client(client_factory)

    detail = client.get(f"/api/marketplace/spaces/{space.public_id}")
    assert detail.status_code == 200, detail.text

    products = detail.json()["space"]["booking_products"]
    assert [product["booking_mode"] for product in products] == [
        BookingMode.HOURLY.value,
        BookingMode.DAY_PASS.value,
    ]
    assert products[0]["label"] == "Hourly reservation"
    assert products[0]["price"] == "30.00"
    assert products[1]["label"] == "Day Rate"
    assert products[1]["price"] == "200.00"


def test_public_membership_plans_include_capacity_and_availability(db_session, client_factory):
    owner, org, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.PRIVATE_OFFICE)
    client = _client(client_factory)

    client.put(
        f"/api/spaces/{space.public_id}/booking-modes",
        json={"booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value, "is_enabled": True},
    )
    client.post(
        "/api/membership-plans",
        json={
            "space_public_id": space.public_id,
            "booking_mode": BookingMode.PRIVATE_OFFICE_LEASE.value,
            "name": "12mo",
            "price_cents": 200000,
            "commitment_months": 12,
            "seats_per_plan": 4,
        },
    )

    open_resp = client.get(
        f"/api/membership-plans/public?space_public_id={space.public_id}"
    )
    assert open_resp.status_code == 200
    open_plans = open_resp.json()
    assert len(open_plans) == 1
    assert open_plans[0]["space_capacity"] == space.capacity
    assert open_plans[0]["available_seats"] == space.capacity

    today = date.today()
    db_session.add(
        Subscription(
            user_id=owner.id,
            space_id=space.id,
            tenant_id=org.id,
            status="active",
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=365),
            booking_mode=BookingMode.PRIVATE_OFFICE_LEASE.value,
            commitment_months=12,
        )
    )
    db_session.commit()

    occupied_resp = client.get(
        f"/api/membership-plans/public?space_public_id={space.public_id}"
    )
    assert occupied_resp.status_code == 200
    occupied_plans = occupied_resp.json()
    assert len(occupied_plans) == 1
    assert occupied_plans[0]["space_capacity"] == space.capacity
    assert occupied_plans[0]["available_seats"] == 0


def test_suite_space_type_accepted(db_session, client_factory):
    _, _, _, space = _seed_owner_with_space(db_session, space_type=SpaceType.SUITE)
    client = _client(client_factory)

    resp = client.put(
        f"/api/spaces/{space.public_id}/booking-modes",
        json={"booking_mode": BookingMode.SUITE_LEASE.value, "is_enabled": True},
    )
    assert resp.status_code == 200, resp.text

    plan_resp = client.post(
        "/api/membership-plans",
        json={
            "space_public_id": space.public_id,
            "booking_mode": BookingMode.SUITE_LEASE.value,
            "name": "Suite — 24 month",
            "price_cents": 1500000,
            "commitment_months": 24,
            "included_meeting_room_hours_per_month": 40,
        },
    )
    assert plan_resp.status_code == 200
