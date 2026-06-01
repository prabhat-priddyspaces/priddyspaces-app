from datetime import date, datetime, timezone
import json

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    PaymentStatus,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.marketing import OutboundMessage
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User
from app.services.booking_email_delivery import BOOKING_EMAIL_CARD_EXPIRING
from app.services.owner_payment_health import classify_card_status


FIXED_NOW = datetime(2026, 6, 1, 12, tzinfo=timezone.utc)


def _user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _org_with_space(db, owner: User, *, name: str = "Payment Health Org"):
    org = Organization(name=name, owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)
    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            is_active=True,
        )
    )
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name=f"{name} Downtown",
        address="1 Main St",
        city="Miami",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Suite 201",
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return org, location, space


def _card_method(db, *, user: User, org: Organization, exp_month=6, exp_year=2026) -> MemberOwnerPaymentMethod:
    method = MemberOwnerPaymentMethod(
        user_id=user.id,
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        owner_payment_setting_id=1,
        provider_customer_id="cus_owner",
        provider_payment_method_id=f"pm_{user.id}_{org.id}",
        last4="4242",
        brand="Visa",
        exp_month=exp_month,
        exp_year=exp_year,
        status="active",
        is_default_for_owner=True,
    )
    db.add(method)
    db.commit()
    db.refresh(method)
    return method


def _owner_token(owner: User) -> dict:
    return {"sub": owner.auth_subject, "email": owner.email, "email_verified": True}


def test_classify_card_status_uses_end_of_month_expiry():
    today = date(2026, 6, 1)

    assert classify_card_status(5, 2026, today=today) == "expired"
    assert classify_card_status(6, 2026, today=today) == "expiring"
    assert classify_card_status(8, 2026, today=today, window_days=30) == "healthy"
    assert classify_card_status(None, 2026, today=today) == "missing_expiry"
    assert classify_card_status(13, 2026, today=today) == "missing_expiry"


def test_owner_payment_health_lists_card_risk_context(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.owner_payment_health.today_utc_date", lambda: FIXED_NOW.date())
    monkeypatch.setattr("app.services.owner_payment_health.now_utc", lambda: FIXED_NOW)
    owner = _user(db_session, "health-owner@example.com", "sub-health-owner", UserAppRole.OWNER)
    member = _user(db_session, "member-card@example.com", "sub-member-card", UserAppRole.MEMBER)
    org, location, space = _org_with_space(db_session, owner)
    method = _card_method(db_session, user=member, org=org)

    other_owner = _user(db_session, "other-owner@example.com", "sub-other-owner", UserAppRole.OWNER)
    other_member = _user(db_session, "other-member@example.com", "sub-other-member", UserAppRole.MEMBER)
    other_org, _other_location, _other_space = _org_with_space(db_session, other_owner, name="Other Org")
    _card_method(db_session, user=other_member, org=other_org)

    req = BookingRequest(
        tenant_id=org.id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=datetime(2026, 6, 15, 14, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 6, 15, 16, tzinfo=timezone.utc),
        status=BookingRequestStatus.REQUESTED,
        member_owner_payment_method_id=method.id,
        pricing_snapshot=json.dumps({"total_cents": 12000}),
    )
    booking = Booking(
        user_id=member.id,
        tenant_id=org.id,
        space_id=space.id,
        start_datetime=datetime(2026, 7, 1, 14, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 7, 1, 15, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    subscription = Subscription(
        user_id=member.id,
        tenant_id=org.id,
        space_id=space.id,
        status="active",
        start_date=date(2026, 6, 1),
    )
    db_session.add_all([req, booking, subscription])
    db_session.commit()
    db_session.refresh(booking)
    db_session.refresh(subscription)
    db_session.add_all(
        [
            Payment(
                user_id=member.id,
                tenant_id=org.id,
                booking_id=booking.id,
                payment_method_id=method.id,
                amount=50,
                amount_cents=5000,
                status=PaymentStatus.REQUIRES_PAYMENT,
                provider="stripe",
                created_at=FIXED_NOW,
            ),
            Payment(
                user_id=member.id,
                tenant_id=org.id,
                subscription_id=subscription.id,
                payment_method_id=method.id,
                amount=200,
                amount_cents=20000,
                status=PaymentStatus.SUCCEEDED,
                provider="stripe",
                created_at=FIXED_NOW,
            ),
        ]
    )
    db_session.add(
        OutboundMessage(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=member.id,
            email=member.email,
            subject="Update your payment card",
            text_body="Update Visa 4242",
            sender_lane="transactional",
            from_email="no-reply@example.com",
            status="sent",
            source="transactional",
            source_context={
                "notification_type": BOOKING_EMAIL_CARD_EXPIRING,
                "member_owner_payment_method_public_id": method.public_id,
                "card_expiry": "06/2026",
            },
            sent_at=FIXED_NOW,
        )
    )
    db_session.commit()

    client = client_factory(_owner_token(owner))
    response = client.get(
        "/api/owner/payment-health/cards",
        params={
            "organization_public_id": org.public_id,
            "location_public_id": location.public_id,
            "status": "all",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_cards"] == 1
    assert body["summary"]["expiring_count"] == 1
    assert body["summary"]["upcoming_booking_value_cents"] == 17000
    assert body["summary"]["recent_paid_volume_cents"] == 20000
    row = body["results"][0]
    assert row["public_id"] == method.public_id
    assert row["member_email"] == "member-card@example.com"
    assert row["card_status"] == "expiring"
    assert row["last_notice"]["status"] == "sent"
    assert row["open_booking_request_count"] == 1
    assert row["future_booking_count"] == 1
    assert row["active_subscription_count"] == 1
    assert row["affected_spaces"][0]["space_name"] == "Suite 201"
    assert set(row["affected_spaces"][0]["sources"]) == {"active_subscription", "future_booking", "open_request"}


def test_owner_payment_health_allows_org_admin_and_rejects_member(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.owner_payment_health.today_utc_date", lambda: FIXED_NOW.date())
    owner = _user(db_session, "health-admin-owner@example.com", "sub-health-admin-owner", UserAppRole.OWNER)
    admin = _user(db_session, "health-admin@example.com", "sub-health-admin", UserAppRole.OWNER)
    member = _user(db_session, "health-member@example.com", "sub-health-member", UserAppRole.MEMBER)
    org, _location, _space = _org_with_space(db_session, owner)
    db_session.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=admin.id,
            role=UserRole.ADMIN,
            is_active=True,
        )
    )
    db_session.commit()

    admin_client = client_factory(_owner_token(admin))
    ok = admin_client.get("/api/owner/payment-health/cards", params={"organization_public_id": org.public_id})
    assert ok.status_code == 200

    member_client = client_factory(_owner_token(member))
    denied = member_client.get("/api/owner/payment-health/cards", params={"organization_public_id": org.public_id})
    assert denied.status_code == 403


def test_owner_payment_health_card_notice_duplicate_guard_and_missing_user(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.owner_payment_health.today_utc_date", lambda: FIXED_NOW.date())
    owner = _user(db_session, "notice-owner@example.com", "sub-notice-owner", UserAppRole.OWNER)
    member = _user(db_session, "notice-member@example.com", "sub-notice-member", UserAppRole.MEMBER)
    org, _location, _space = _org_with_space(db_session, owner)
    method = _card_method(db_session, user=member, org=org)
    missing_user_method = MemberOwnerPaymentMethod(
        user_id=9999,
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        owner_payment_setting_id=1,
        provider_customer_id="cus_missing",
        provider_payment_method_id="pm_missing",
        last4="1111",
        brand="Visa",
        exp_month=6,
        exp_year=2026,
        status="active",
    )
    db_session.add(missing_user_method)
    db_session.commit()
    db_session.refresh(missing_user_method)
    client = client_factory(_owner_token(owner))

    first = client.post(
        "/api/owner/payment-health/card-notices",
        json={
            "organization_public_id": org.public_id,
            "payment_method_public_ids": [method.public_id, missing_user_method.public_id],
        },
    )
    second = client.post(
        "/api/owner/payment-health/card-notices",
        json={
            "organization_public_id": org.public_id,
            "payment_method_public_ids": [method.public_id],
        },
    )

    assert first.status_code == 200
    first_body = first.json()
    assert first_body["sent_count"] == 1
    assert first_body["skipped_count"] == 1
    assert first_body["results"][1]["reason"] == "missing_email"
    assert second.status_code == 200
    second_body = second.json()
    assert second_body["skipped_count"] == 1
    assert second_body["results"][0]["reason"] == "already_sent"
    outbounds = db_session.query(OutboundMessage).all()
    assert sum(
        1
        for outbound in outbounds
        if (outbound.source_context or {}).get("member_owner_payment_method_public_id") == method.public_id
    ) == 1


def test_owner_payment_health_card_notice_hides_cross_org_methods(db_session, client_factory):
    owner = _user(db_session, "cross-owner@example.com", "sub-cross-owner", UserAppRole.OWNER)
    other_owner = _user(db_session, "cross-other@example.com", "sub-cross-other", UserAppRole.OWNER)
    other_member = _user(db_session, "cross-member@example.com", "sub-cross-member", UserAppRole.MEMBER)
    _org_with_space(db_session, owner)
    other_org, _other_location, _other_space = _org_with_space(db_session, other_owner, name="Cross Other")
    other_method = _card_method(db_session, user=other_member, org=other_org)
    client = client_factory(_owner_token(owner))

    response = client.post(
        "/api/owner/payment-health/card-notices",
        json={"payment_method_public_ids": [other_method.public_id]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["skipped_count"] == 1
    assert body["results"][0]["reason"] == "not_found"
