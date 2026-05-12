"""End-to-end membership-purchase flow:
- member submits a request with membership_plan_public_id
- owner approves -> Stripe Subscription created (mocked) -> Subscription row + ledger GRANT
- /subscriptions/{id}/meeting-room-balance reflects the grant

Also covers:
- XOR validator on BookingRequestCreate
- subscription_overlaps respects booking_mode (coworking membership doesn't block hourly)
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import (
    BookingMode,
    BookingRequestKind,
    BookingRequestStatus,
    LedgerEntryType,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.meeting_room_hour_ledger import MeetingRoomHourLedger
from app.models.membership_plan import MembershipPlan
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.subscription import Subscription
from app.models.user import User
from app.services.availability import subscription_overlaps
from app.services.membership_subscriptions import StripeSubscriptionResult


# ----------------------------- fixtures -----------------------------


def _seed(db, *, space_type: SpaceType = SpaceType.PRIVATE_OFFICE):
    owner = User(
        email="mp-owner@example.com",
        auth_subject="mp-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    member = User(
        email="mp-member@example.com",
        auth_subject="mp-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db.add_all([owner, member])
    db.commit()
    db.refresh(owner)
    db.refresh(member)

    org = Organization(name="MP Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

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
        name="Loc",
        address="1",
        city="Town",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=space_type,
        capacity=4,
        price_monthly=200000,
    )
    db.add(space)
    db.commit()
    db.refresh(space)

    setting = OwnerPaymentSetting(
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test",
        stripe_secret_key_encrypted="sk_test",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)

    method = MemberOwnerPaymentMethod(
        user_id=member.id,
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        owner_payment_setting_id=setting.id,
        provider_customer_id="cus_x",
        provider_payment_method_id="pm_x",
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

    return owner, member, org, location, space, setting, method


def _enable_mode_and_make_plan(
    db,
    space: Space,
    *,
    booking_mode: BookingMode,
    commitment_months: int | None = 12,
    included_hours: int = 16,
    price_cents: int = 200000,
) -> MembershipPlan:
    db.add(
        SpaceBookingMode(
            tenant_id=space.tenant_id,
            space_id=space.id,
            booking_mode=booking_mode.value,
            is_enabled=True,
        )
    )
    plan = MembershipPlan(
        tenant_id=space.tenant_id,
        organization_id=space.tenant_id,
        space_id=space.id,
        booking_mode=booking_mode.value,
        name="12-month Lease",
        price_cents=price_cents,
        billing_cycle="monthly",
        commitment_months=commitment_months,
        included_meeting_room_hours_per_month=included_hours,
        overage_hourly_rate_cents=5000,
        seats_per_plan=4,
        is_active=True,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


# ----------------------------- tests -----------------------------


def test_membership_purchase_request_create_and_approve(
    db_session, client_factory, monkeypatch
):
    owner, member, _, _, space, setting, method = _seed(db_session)
    plan = _enable_mode_and_make_plan(
        db_session, space, booking_mode=BookingMode.PRIVATE_OFFICE_LEASE
    )

    captured: dict = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return StripeSubscriptionResult(
            subscription_id="sub_test123",
            status="active",
            raw={"id": "sub_test123"},
        )

    monkeypatch.setattr(
        "app.api.booking_requests.create_stripe_subscription", fake_create
    )

    member_client = client_factory(
        {"sub": "mp-member", "email": member.email, "email_verified": True}
    )

    desired_start = date(2026, 5, 1)
    create_resp = member_client.post(
        "/api/booking-requests",
        json={
            "membership_plan_public_id": plan.public_id,
            "desired_start_date": desired_start.isoformat(),
            "member_owner_payment_method_public_id": method.public_id,
            "payment_authorization_consent": True,
        },
    )
    assert create_resp.status_code == 200, create_resp.text
    data = create_resp.json()
    assert data["request_kind"] == BookingRequestKind.LEASE_PURCHASE.value
    assert data["membership_plan_public_id"] == plan.public_id
    assert data["status"] == BookingRequestStatus.REQUESTED.value
    assert data["commitment_months_snapshot"] == 12
    assert data["estimated_amount"] == plan.price_cents // 100

    req_public_id = data["public_id"]

    owner_client = client_factory(
        {"sub": "mp-owner", "email": owner.email, "email_verified": True}
    )
    approve_resp = owner_client.post(
        f"/api/booking-requests/{req_public_id}/approve", json={}
    )
    assert approve_resp.status_code == 200, approve_resp.text
    approved = approve_resp.json()
    assert approved["status"] == BookingRequestStatus.APPROVED.value
    assert captured["plan"].id == plan.id
    assert captured["commitment_months"] == 12

    # Subscription created
    sub = (
        db_session.query(Subscription)
        .filter(Subscription.user_id == member.id, Subscription.space_id == space.id)
        .first()
    )
    assert sub is not None
    assert sub.stripe_subscription_id == "sub_test123"
    assert sub.commitment_months == 12
    assert sub.commitment_start_date == desired_start
    assert sub.commitment_end_date is not None
    assert sub.included_meeting_room_hours_per_month == 16
    assert sub.booking_mode == BookingMode.PRIVATE_OFFICE_LEASE.value

    # Initial GRANT entry written for 16h * 60min
    grants = (
        db_session.query(MeetingRoomHourLedger)
        .filter(
            MeetingRoomHourLedger.subscription_id == sub.id,
            MeetingRoomHourLedger.entry_type == LedgerEntryType.GRANT.value,
        )
        .all()
    )
    assert len(grants) == 1
    assert grants[0].hours_delta_minutes == 16 * 60

    # Balance endpoint
    balance_resp = member_client.get(
        f"/api/subscriptions/{sub.public_id}/meeting-room-balance"
    )
    assert balance_resp.status_code == 200, balance_resp.text
    bal = balance_resp.json()
    assert bal["granted_minutes"] == 16 * 60
    assert bal["used_minutes"] == 0
    assert bal["remaining_minutes"] == 16 * 60
    assert bal["overage_hourly_rate_cents"] == 5000


def test_booking_request_xor_validator_rejects_mixed_payload(
    db_session, client_factory
):
    _, member, _, _, space, _, method = _seed(db_session)
    member_client = client_factory(
        {"sub": "mp-member", "email": member.email, "email_verified": True}
    )

    resp = member_client.post(
        "/api/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc).isoformat(),
            "membership_plan_public_id": "abc",
            "desired_start_date": "2026-05-01",
            "member_owner_payment_method_public_id": method.public_id,
            "payment_authorization_consent": True,
        },
    )
    assert resp.status_code == 422


def test_booking_request_xor_validator_rejects_empty_payload(
    db_session, client_factory
):
    _, member, *_ = _seed(db_session)
    member_client = client_factory(
        {"sub": "mp-member", "email": member.email, "email_verified": True}
    )

    resp = member_client.post("/api/booking-requests", json={})
    assert resp.status_code == 422


def test_membership_request_blocked_when_booking_mode_disabled(
    db_session, client_factory, monkeypatch
):
    _, member, _, _, space, _, method = _seed(db_session)
    # Plan exists but mode is NOT enabled on the space.
    plan = MembershipPlan(
        tenant_id=space.tenant_id,
        organization_id=space.tenant_id,
        space_id=space.id,
        booking_mode=BookingMode.PRIVATE_OFFICE_LEASE.value,
        name="Lease",
        price_cents=100000,
        billing_cycle="monthly",
        commitment_months=12,
        is_active=True,
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    member_client = client_factory(
        {"sub": "mp-member", "email": member.email, "email_verified": True}
    )
    resp = member_client.post(
        "/api/booking-requests",
        json={
            "membership_plan_public_id": plan.public_id,
            "desired_start_date": "2026-05-01",
            "member_owner_payment_method_public_id": method.public_id,
            "payment_authorization_consent": True,
        },
    )
    assert resp.status_code == 400
    assert "not currently enabled" in resp.json()["detail"].lower()


def test_subscription_overlaps_skips_coworking_membership(db_session):
    """Coworking memberships shouldn't block other bookings on the same space."""
    _, member, _, _, space, *_ = _seed(db_session, space_type=SpaceType.SHARED_DESK)

    sub = Subscription(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        status="active",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 6, 1),
        booking_mode=BookingMode.MONTHLY_MEMBERSHIP.value,
        included_meeting_room_hours_per_month=0,
    )
    db_session.add(sub)
    db_session.commit()

    blocks = subscription_overlaps(
        db_session, space.id, date(2026, 5, 10), date(2026, 5, 10)
    )
    assert blocks is False


def test_subscription_overlaps_blocks_private_office_lease(db_session):
    _, member, _, _, space, *_ = _seed(db_session, space_type=SpaceType.PRIVATE_OFFICE)

    sub = Subscription(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        status="active",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 6, 1),
        booking_mode=BookingMode.PRIVATE_OFFICE_LEASE.value,
        included_meeting_room_hours_per_month=16,
    )
    db_session.add(sub)
    db_session.commit()

    blocks = subscription_overlaps(
        db_session, space.id, date(2026, 5, 10), date(2026, 5, 10)
    )
    assert blocks is True


def test_subscription_overlaps_legacy_subscription_still_blocks(db_session):
    """Subscriptions without a booking_mode (legacy data) keep blocking."""
    _, member, _, _, space, *_ = _seed(db_session)

    sub = Subscription(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        status="active",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 6, 1),
    )
    db_session.add(sub)
    db_session.commit()

    blocks = subscription_overlaps(
        db_session, space.id, date(2026, 5, 10), date(2026, 5, 10)
    )
    assert blocks is True
