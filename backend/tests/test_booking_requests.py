import json
from datetime import datetime, time, timedelta, timezone
from unittest.mock import MagicMock

from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location_admin import LocationAdmin
from app.models.location import Location
from app.models.space import Space
from app.models.space_setup_fee_item import SpaceSetupFeeItem
from app.models.booking_request import BookingRequest
from app.models.booking_promotion import BookingPromotion
from app.models.booking import Booking
from app.models.promo_code import PromoCode
from app.models.tax_config import TaxConfig
from app.models.audit_log import AuditLog
from app.models.booking_series import BookingSeries
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.marketing import OutboundMessage
from app.services.booking_email_delivery import safe_error_label
from app.services.payment_providers import ChargeResult
from app.api.booking_requests import _owner_notification_emails_for_space


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

    org = Organization(
        name="Owner Org",
        owner_id=owner.id,
        review_status=OrganizationReviewStatus.APPROVED,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
        receives_new_booking_email=True,
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
        price_daily=200,
        price_hourly=50,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, space


def _seed_payment_method(db, member: User, space: Space) -> MemberOwnerPaymentMethod:
    setting = OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted="sk_test_owner",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    method = MemberOwnerPaymentMethod(
        user_id=member.id,
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


def _seed_owner_payment_setting(db, space: Space) -> OwnerPaymentSetting:
    existing = (
        db.query(OwnerPaymentSetting)
        .filter(
            OwnerPaymentSetting.organization_id == space.tenant_id,
            OwnerPaymentSetting.provider == "stripe",
        )
        .first()
    )
    if existing:
        return existing
    setting = OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted="sk_test_owner",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


def _publish_space_for_preview(db, space: Space) -> None:
    location = db.query(Location).filter(Location.id == space.location_id).one()
    location.status = LocationStatus.ACTIVE
    space.visibility = SpaceVisibility.PUBLIC
    db.add_all([location, space])
    _seed_owner_payment_setting(db, space)
    db.commit()


def _seed_extra_payment_method(
    db,
    member: User,
    space: Space,
    setting_id: int,
    *,
    provider_payment_method_id: str,
    last4: str,
) -> MemberOwnerPaymentMethod:
    method = MemberOwnerPaymentMethod(
        user_id=member.id,
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        owner_payment_setting_id=setting_id,
        provider_customer_id="cus_test",
        provider_payment_method_id=provider_payment_method_id,
        last4=last4,
        brand="visa",
        exp_month=12,
        exp_year=2030,
        is_default_for_owner=False,
        status="active",
    )
    db.add(method)
    db.commit()
    db.refresh(method)
    return method


class FakeProvider:
    def charge_saved_method(self, **kwargs):
        return ChargeResult(status="succeeded", provider_payment_id="pi_owner_test", raw_response={"ok": True})


def _booking_outbounds(db, req_id: str, notification_type: str | None = None):
    rows = db.query(OutboundMessage).filter(OutboundMessage.source == "booking").all()
    rows = [
        row
        for row in rows
        if (row.source_context or {}).get("booking_request_public_id") == req_id
    ]
    if notification_type:
        rows = [
            row
            for row in rows
            if (row.source_context or {}).get("notification_type") == notification_type
        ]
    return rows


def _mock_sendgrid(monkeypatch):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "SG.test")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    response = MagicMock()
    response.status_code = 202
    response.text = ""
    response.headers = {"X-Message-Id": "sg-message"}
    sent: list[dict] = []

    def fake_post(*args, **kwargs):
        sent.append(kwargs["json"])
        return response

    monkeypatch.setattr("app.services.notifications.httpx.post", fake_post)
    return sent


def _request_payload(space: Space, method: MemberOwnerPaymentMethod | None, day: int = 10):
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 3, day, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 3, day, 12, 0, tzinfo=timezone.utc).isoformat(),
        "payment_authorization_consent": True,
    }
    if method:
        payload["member_owner_payment_method_public_id"] = method.public_id
    return payload


def test_conference_day_rate_preview_uses_day_rate_label(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    _publish_space_for_preview(db_session, space)
    client = client_factory({})

    response = client.post(
        "/api/booking-requests/preview",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 3, 10, 17, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "day_pass",
            "full_day": True,
            "seats_requested": 1,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["line_items"][0]["label"] == "Day Rate"


def test_owner_can_replace_setup_fee_items(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })

    response = owner_client.put(
        f"/api/spaces/{space.public_id}/setup-fees",
        json={
            "items": [
                {"label": "Room setup", "amount_cents": 7500, "sort_order": 0},
                {"label": "After-hours access", "amount_cents": 2500, "sort_order": 1},
            ]
        },
    )

    assert response.status_code == 200, response.text
    assert [item["label"] for item in response.json()] == ["Room setup", "After-hours access"]
    assert sum(item["amount_cents"] for item in response.json()) == 10000


def test_member_cannot_replace_setup_fee_items(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    member = User(
        email="setup-fee-member@example.com",
        auth_subject="sub-setup-fee-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    response = member_client.put(
        f"/api/spaces/{space.public_id}/setup-fees",
        json={"items": [{"label": "Room setup", "amount_cents": 7500}]},
    )

    assert response.status_code == 403


def test_booking_preview_includes_setup_fee_items_once(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    _publish_space_for_preview(db_session, space)
    db_session.add_all(
        [
            SpaceSetupFeeItem(tenant_id=space.tenant_id, space_id=space.id, label="Room setup", amount_cents=7500),
            SpaceSetupFeeItem(tenant_id=space.tenant_id, space_id=space.id, label="Cleaning", amount_cents=2500, sort_order=1),
        ]
    )
    db_session.commit()
    client = client_factory({})

    response = client.post(
        "/api/booking-requests/preview",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 3, 10, 10, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["base_amount_cents"] == 10000
    assert body["setup_fee_amount_cents"] == 10000
    assert body["total_amount_cents"] == 20000
    assert [item["label"] for item in body["line_items"]] == ["Hourly reservation", "Room setup", "Cleaning"]


def test_shared_desk_preview_applies_setup_fee_once_per_checkout_not_seat(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    _publish_space_for_preview(db_session, space)
    space.space_type = SpaceType.SHARED_DESK
    space.price_hourly = None
    space.price_daily = 25
    space.capacity = 4
    db_session.add(
        SpaceSetupFeeItem(tenant_id=space.tenant_id, space_id=space.id, label="Desk setup", amount_cents=1000)
    )
    db_session.commit()
    client = client_factory({})

    response = client.post(
        "/api/booking-requests/preview",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 3, 10, 17, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "day_pass",
            "full_day": True,
            "seats_requested": 2,
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["base_amount_cents"] == 5000
    assert body["setup_fee_amount_cents"] == 1000
    assert body["total_amount_cents"] == 6000


def test_member_promo_preview_and_successful_booking_redemption(db_session, client_factory, monkeypatch):
    owner, space = _seed_owner_space(db_session)
    db_session.add(TaxConfig(tenant_id=space.tenant_id, rate_percent=10))
    promo = PromoCode(
        tenant_id=space.tenant_id,
        code="SUMMER20",
        description="Summer launch",
        discount_type="percent",
        discount_value=20,
        max_redemptions=2,
        max_redemptions_per_member=1,
        is_active=True,
    )
    member = User(
        email="promo-member@example.com",
        auth_subject="sub-promo-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add_all([promo, member])
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    _publish_space_for_preview(db_session, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    preview = member_client.post(
        "/api/booking-requests/preview",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 3, 23, 10, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 3, 23, 12, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "promo_code": "summer20",
        },
    )
    assert preview.status_code == 200, preview.text
    preview_body = preview.json()
    assert preview_body["base_amount_cents"] == 10000
    assert preview_body["promo_code"] == "SUMMER20"
    assert preview_body["promo_discount_amount_cents"] == 2000
    assert preview_body["tax_amount_cents"] == 800
    assert preview_body["total_amount_cents"] == 8800

    create_payload = _request_payload(space, method, day=23)
    create_payload["promo_code"] = "SUMMER20"
    create = member_client.post("/api/booking-requests", json=create_payload)
    assert create.status_code == 200, create.text
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == create.json()["public_id"]).one()

    class SucceedingProvider:
        def charge_saved_method(self, **kwargs):
            assert kwargs["amount_cents"] == 8800
            return ChargeResult(status="succeeded", provider_payment_id="pi_promo", raw_response={"ok": True})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda _setting: SucceedingProvider())
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    approved = owner_client.post(f"/api/booking-requests/{req.public_id}/approve", json={})
    assert approved.status_code == 200, approved.text

    db_session.refresh(promo)
    promotion = db_session.query(BookingPromotion).filter(BookingPromotion.booking_request_id == req.id).one()
    assert promo.total_redemptions == 1
    assert promotion.discount_amount == 2000
    assert promotion.promo_code_snapshot["code"] == "SUMMER20"
    assert promotion.promo_code_snapshot["description"] == "Summer launch"

    invoices = owner_client.get("/api/invoices")
    assert invoices.status_code == 200, invoices.text
    assert any("Promo SUMMER20" in invoice["description"] for invoice in invoices.json())


def test_promo_preview_rejects_expired_inactive_and_limit_reached(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    _publish_space_for_preview(db_session, space)
    member = User(
        email="promo-errors@example.com",
        auth_subject="sub-promo-errors",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add_all(
        [
            member,
            PromoCode(
                tenant_id=space.tenant_id,
                code="EXPIRED",
                discount_type="percent",
                discount_value=10,
                expires_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                is_active=True,
            ),
            PromoCode(
                tenant_id=space.tenant_id,
                code="INACTIVE",
                discount_type="percent",
                discount_value=10,
                is_active=False,
            ),
            PromoCode(
                tenant_id=space.tenant_id,
                code="MAXED",
                discount_type="percent",
                discount_value=10,
                max_redemptions=1,
                total_redemptions=1,
                is_active=True,
            ),
        ]
    )
    db_session.commit()
    client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    base_payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 3, 24, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 3, 24, 12, 0, tzinfo=timezone.utc).isoformat(),
        "booking_mode": "hourly",
        "full_day": False,
    }

    expired = client.post("/api/booking-requests/preview", json={**base_payload, "promo_code": "EXPIRED"})
    inactive = client.post("/api/booking-requests/preview", json={**base_payload, "promo_code": "INACTIVE"})
    maxed = client.post("/api/booking-requests/preview", json={**base_payload, "promo_code": "MAXED"})

    assert expired.status_code == 400
    assert expired.json()["detail"] == "Promo code expired"
    assert inactive.status_code == 400
    assert inactive.json()["detail"] == "Promo code inactive"
    assert maxed.status_code == 400
    assert maxed.json()["detail"] == "Redemption limit reached"


def test_manual_booking_charge_uses_setup_fee_snapshot_after_fee_changes(db_session, client_factory, monkeypatch):
    owner, space = _seed_owner_space(db_session)
    db_session.add(
        SpaceSetupFeeItem(tenant_id=space.tenant_id, space_id=space.id, label="Original setup", amount_cents=7500)
    )
    db_session.commit()
    member = User(
        email="snapshot-member@example.com",
        auth_subject="sub-snapshot-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=21))
    assert create.status_code == 200, create.text
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == create.json()["public_id"]).one()
    snapshot = json.loads(req.pricing_snapshot)
    assert snapshot["setup_fee_cents"] == 7500

    db_session.query(SpaceSetupFeeItem).filter(SpaceSetupFeeItem.space_id == space.id).delete()
    db_session.add(
        SpaceSetupFeeItem(tenant_id=space.tenant_id, space_id=space.id, label="Changed setup", amount_cents=99900)
    )
    db_session.commit()
    captured: dict[str, int] = {}

    class CapturingProvider:
        def charge_saved_method(self, **kwargs):
            captured["amount_cents"] = kwargs["amount_cents"]
            return ChargeResult(status="succeeded", provider_payment_id="pi_snapshot", raw_response={"ok": True})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda _setting: CapturingProvider())
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })

    approved = owner_client.post(f"/api/booking-requests/{req.public_id}/approve", json={})

    assert approved.status_code == 200, approved.text
    assert captured["amount_cents"] == 17500


def test_booking_preview_hides_pending_owner_inventory(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    _publish_space_for_preview(db_session, space)
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).one()
    org.review_status = OrganizationReviewStatus.PENDING
    db_session.add(org)
    db_session.commit()
    client = client_factory({})

    response = client.post(
        "/api/booking-requests/preview",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 3, 11, 9, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 3, 11, 10, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Space not found"


def test_booking_request_create_and_list(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    location = db_session.query(Location).filter(Location.id == space.location_id).first()
    owner.full_name = "Olivia Owner"
    space.name = "Board Room"
    location.public_phone = "(555) 010-2026"
    location.public_email = "frontdesk@example.com"
    location.state = "TX"
    location.postal_code = "78701"
    db_session.add_all([owner, space, location])
    db_session.commit()
    member = User(
        email="member@example.com",
        auth_subject="sub-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

    member_client = client_factory({
        "sub": "sub-member",
        "email": "member@example.com",
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.REQUESTED.value
    assert data["estimated_amount"] is not None
    assert data["created_at"] is not None
    assert data["space_name"] == "Board Room"
    assert data["space_type"] == SpaceType.CONFERENCE_ROOM.value
    assert data["location_public_id"] == location.public_id
    assert data["location_name"] == "Main"
    assert data["location_address"] == "123 Main"
    assert data["location_city"] == "Testville"
    assert data["location_state"] == "TX"
    assert data["location_postal_code"] == "78701"
    assert data["location_timezone"] == "UTC"
    assert data["location_public_phone"] == "(555) 010-2026"
    assert data["location_public_email"] == "frontdesk@example.com"
    assert data["support_contacts"] == [{"name": "Olivia Owner", "title": "Owner"}]

    listing = member_client.get("/api/booking-requests")
    assert listing.status_code == 200
    listed = listing.json()
    assert len(listed) == 1
    assert listed[0]["created_at"] == data["created_at"]
    assert listed[0]["space_name"] == "Board Room"
    assert listed[0]["support_contacts"] == [{"name": "Olivia Owner", "title": "Owner"}]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    owner_list = owner_client.get("/api/booking-requests?status=requested")
    assert owner_list.status_code == 200
    assert len(owner_list.json()) == 1
    owner_request = owner_list.json()[0]
    assert owner_request["member_email"] == "member@example.com"
    assert owner_request["space_public_id"] == space.public_id
    assert owner_request["location_name"] == "Main"


def test_booking_request_create_hides_pending_owner_inventory(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).one()
    org.review_status = OrganizationReviewStatus.PENDING
    db_session.add(org)
    db_session.commit()
    member = User(
        email="pending-member@example.com",
        auth_subject="sub-pending-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    response = member_client.post("/api/booking-requests", json=_request_payload(space, None, day=18))

    assert response.status_code == 404
    assert response.json()["detail"] == "Space not found"
    assert db_session.query(BookingRequest).filter(BookingRequest.space_id == space.id).count() == 0


def test_booking_request_create_hides_private_inventory(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    space.visibility = SpaceVisibility.PRIVATE
    db_session.add(space)
    db_session.commit()
    member = User(
        email="private-member@example.com",
        auth_subject="sub-private-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    response = member_client.post("/api/booking-requests", json=_request_payload(space, None, day=19))

    assert response.status_code == 404
    assert response.json()["detail"] == "Space not found"


def test_shared_desk_rejects_hourly_booking(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    space.space_type = SpaceType.SHARED_DESK
    space.capacity = 4
    space.price_daily = 25
    space.price_hourly = None
    db_session.add(space)

    member = User(
        email="desk-member@example.com",
        auth_subject="sub-desk-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    payload = _request_payload(space, method, day=8)
    payload["booking_mode"] = "hourly"
    payload["full_day"] = False
    resp = member_client.post("/api/booking-requests", json=payload)

    assert resp.status_code == 400
    assert "shared desks" in resp.json()["detail"].lower()


def test_shared_desk_day_pass_uses_pooled_capacity(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    space.space_type = SpaceType.SHARED_DESK
    space.capacity = 2
    space.price_daily = 25
    space.price_hourly = None
    db_session.add(space)

    member = User(
        email="desk-capacity@example.com",
        auth_subject="sub-desk-capacity",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 3, 9, 9, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 3, 9, 18, 0, tzinfo=timezone.utc).isoformat(),
        "booking_mode": "day_pass",
        "full_day": True,
        "seats_requested": 2,
        "payment_authorization_consent": True,
        "member_owner_payment_method_public_id": method.public_id,
    }
    first = member_client.post("/api/booking-requests", json=payload)
    assert first.status_code == 200, first.text

    second_member = User(
        email="desk-capacity-two@example.com",
        auth_subject="sub-desk-capacity-two",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(second_member)
    db_session.commit()
    db_session.refresh(second_member)
    second_method = _seed_extra_payment_method(
        db_session,
        second_member,
        space,
        method.owner_payment_setting_id,
        provider_payment_method_id="pm_shared_capacity_two",
        last4="2222",
    )
    second_client = client_factory({
        "sub": second_member.auth_subject,
        "email": second_member.email,
        "email_verified": True,
    })
    payload["seats_requested"] = 1
    payload["member_owner_payment_method_public_id"] = second_method.public_id
    second = second_client.post("/api/booking-requests", json=payload)
    assert second.status_code == 409
    assert "shared desk seats" in second.json()["detail"].lower()


def test_same_member_cannot_duplicate_shared_desk_slot_when_capacity_remains(db_session, client_factory):
    _, space = _seed_owner_space(db_session)
    space.space_type = SpaceType.SHARED_DESK
    space.capacity = 4
    space.price_daily = 25
    space.price_hourly = None
    db_session.add(space)

    member = User(
        email="desk-duplicate@example.com",
        auth_subject="sub-desk-duplicate",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 3, 10, 18, 0, tzinfo=timezone.utc).isoformat(),
        "booking_mode": "day_pass",
        "full_day": True,
        "seats_requested": 1,
        "payment_authorization_consent": True,
        "member_owner_payment_method_public_id": method.public_id,
    }
    first = member_client.post("/api/booking-requests", json=payload)
    assert first.status_code == 200, first.text

    second = member_client.post("/api/booking-requests", json=payload)
    assert second.status_code == 409
    assert second.json()["detail"] == "Booking request already exists for that time"


def test_owner_can_update_organization_booking_settings(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })

    current = owner_client.get(f"/api/orgs/{org.public_id}/booking-settings")
    assert current.status_code == 200
    assert current.json()["booking_approval_mode"] == "manual"
    assert current.json()["membership_lease_approval_mode"] == "manual"
    assert current.json()["payment_failure_hold_minutes"] == 30
    assert current.json()["waitlist_enabled"] is False
    assert current.json()["waitlist_conference_room_enabled"] is False

    updated = owner_client.patch(
        f"/api/orgs/{org.public_id}/booking-settings",
        json={
            "booking_approval_mode": "auto",
            "membership_lease_approval_mode": "auto",
            "payment_failure_hold_minutes": 15,
            "waitlist_conference_room_enabled": True,
            "waitlist_private_office_enabled": False,
            "waitlist_shared_desk_enabled": True,
            "waitlist_suite_enabled": False,
            "waitlist_virtual_office_enabled": True,
        },
    )

    assert updated.status_code == 200
    assert updated.json()["booking_approval_mode"] == "auto"
    assert updated.json()["membership_lease_approval_mode"] == "auto"
    assert updated.json()["payment_failure_hold_minutes"] == 15
    assert updated.json()["waitlist_enabled"] is True
    assert updated.json()["waitlist_conference_room_enabled"] is True
    assert updated.json()["waitlist_private_office_enabled"] is False
    assert updated.json()["waitlist_shared_desk_enabled"] is True
    assert updated.json()["waitlist_suite_enabled"] is False
    assert updated.json()["waitlist_virtual_office_enabled"] is True

    legacy_update = owner_client.patch(
        f"/api/orgs/{org.public_id}/booking-settings",
        json={"waitlist_enabled": False},
    )
    assert legacy_update.status_code == 200
    assert legacy_update.json()["waitlist_enabled"] is False
    assert legacy_update.json()["waitlist_conference_room_enabled"] is False
    assert legacy_update.json()["waitlist_shared_desk_enabled"] is False


def test_owner_notification_recipients_require_opt_in_and_location_access(db_session):
    owner, space = _seed_owner_space(db_session)
    location = db_session.query(Location).filter(Location.id == space.location_id).first()
    org_id = location.organization_id

    admin = User(
        email="admin-recipient@example.com",
        auth_subject="sub-admin-recipient",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    staff = User(
        email="staff-recipient@example.com",
        auth_subject="sub-staff-recipient",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    opted_out = User(
        email="opted-out@example.com",
        auth_subject="sub-opted-out",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    no_access = User(
        email="no-access@example.com",
        auth_subject="sub-no-access",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add_all([admin, staff, opted_out, no_access])
    db_session.commit()

    db_session.add_all(
        [
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=admin.id,
                role=UserRole.ADMIN,
                receives_new_booking_email=True,
            ),
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=staff.id,
                role=UserRole.STAFF,
                receives_new_booking_email=True,
            ),
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=opted_out.id,
                role=UserRole.ADMIN,
                receives_new_booking_email=False,
            ),
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=no_access.id,
                role=UserRole.STAFF,
                receives_new_booking_email=True,
            ),
            LocationAdmin(location_id=location.id, tenant_id=org_id, user_id=admin.id),
            LocationAdmin(location_id=location.id, tenant_id=org_id, user_id=staff.id),
        ]
    )
    db_session.commit()

    assert _owner_notification_emails_for_space(db_session, space) == [
        "admin-recipient@example.com",
        "owner@example.com",
        "staff-recipient@example.com",
    ]


def test_booking_request_submission_records_requester_and_owner_email_attempts(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="submitted-member@example.com",
        auth_subject="sub-submitted-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=2))

    assert create.status_code == 200
    req_id = create.json()["public_id"]
    submitted = _booking_outbounds(db_session, req_id, "request_submitted")
    owner_notices = _booking_outbounds(db_session, req_id, "owner_booking_request")
    assert len(submitted) == 1
    assert submitted[0].email == member.email
    assert submitted[0].status == "failed"
    assert submitted[0].source_context["diagnostic"] == "sendgrid_not_configured"
    assert len(owner_notices) == 1
    assert owner_notices[0].email == owner.email

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    owner_list = owner_client.get("/api/booking-requests?status=requested")
    assert owner_list.status_code == 200
    summary = owner_list.json()[0]["email_delivery_summary"]
    assert {item["notification_type"] for item in summary} >= {"request_submitted", "owner_booking_request"}
    assert any(item["status"] == "failed" for item in summary)


def test_booking_transactional_email_bypasses_unsubscribe(
    db_session,
    client_factory,
    monkeypatch,
):
    sent = _mock_sendgrid(monkeypatch)
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="unsubscribed-booking@example.com",
        auth_subject="sub-unsubscribed-booking",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
        email_unsubscribed_at=datetime.now(timezone.utc),
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=3))

    assert create.status_code == 200
    assert any(
        payload["personalizations"][0]["to"][0]["email"] == member.email
        for payload in sent
    )


def test_booking_email_sendgrid_failure_records_failed_outbound(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "SG.test")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    response = MagicMock()
    response.status_code = 400
    response.text = "bad sender"
    response.headers = {}
    monkeypatch.setattr("app.services.notifications.httpx.post", lambda *args, **kwargs: response)
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="bad-sendgrid@example.com",
        auth_subject="sub-bad-sendgrid",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=7))

    assert create.status_code == 200
    req_id = create.json()["public_id"]
    submitted = _booking_outbounds(db_session, req_id, "request_submitted")
    assert submitted[0].status == "failed"
    assert "bad sender" in submitted[0].error


def test_booking_email_safe_error_label_identifies_sender_rejection(db_session):
    outbound = OutboundMessage(
        organization_id=1,
        tenant_id=1,
        email="customer@example.com",
        subject="Booking request submitted",
        html_body="<p>Body</p>",
        text_body="Body",
        sender_lane="transactional",
        from_email="no-reply@priddyspaces.com",
        from_name="Priddyspaces",
        provider="sendgrid",
        status="failed",
        source="booking",
        source_context={"notification_type": "request_submitted"},
        error='{"errors":[{"message":"The from address does not match a verified Sender Identity."}]}',
    )
    db_session.add(outbound)
    db_session.commit()

    assert safe_error_label(outbound) == "Sender address is not verified"


def test_booking_email_resend_endpoint_creates_new_attempt(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="resend-member@example.com",
        auth_subject="sub-resend-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=6))
    req_id = create.json()["public_id"]
    assert len(_booking_outbounds(db_session, req_id, "request_submitted")) == 1

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    resend = owner_client.post(
        f"/api/booking-requests/{req_id}/emails/resend",
        json={"notification_type": "request_submitted"},
    )

    assert resend.status_code == 200
    attempts = _booking_outbounds(db_session, req_id, "request_submitted")
    assert len(attempts) == 2
    assert any((attempt.source_context or {}).get("resend") is True for attempt in attempts)


def test_sendgrid_webhook_updates_booking_outbound(
    db_session,
    client_factory,
    monkeypatch,
):
    sent = _mock_sendgrid(monkeypatch)
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="booking-webhook@example.com",
        auth_subject="sub-booking-webhook",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=8))
    req_id = create.json()["public_id"]
    outbound_public_id = sent[0]["personalizations"][0]["custom_args"]["outbound_public_id"]
    outbound = db_session.query(OutboundMessage).filter(OutboundMessage.public_id == outbound_public_id).one()

    response = member_client.post(
        "/api/webhooks/sendgrid",
        json=[
            {
                "event": "delivered",
                "email": member.email,
                "sg_event_id": "evt-booking-delivered",
                "outbound_public_id": outbound.public_id,
            }
        ],
    )

    assert response.status_code == 200
    db_session.refresh(outbound)
    assert outbound.status == "delivered"
    assert _booking_outbounds(db_session, req_id, "request_submitted")[0].status == "delivered"


def test_guest_booking_request_survives_notification_failure(db_session, client_factory, monkeypatch):
    _owner, space = _seed_owner_space(db_session)
    _seed_owner_payment_setting(db_session, space)

    def fail_notification(*args, **kwargs):
        raise RuntimeError("email service unavailable")

    monkeypatch.setattr(
        "app.api.booking_requests.send_booking_request_submitted_email",
        fail_notification,
    )
    monkeypatch.setattr(
        "app.api.booking_requests._notify_owner_team_of_request",
        fail_notification,
    )

    client = client_factory({})
    resp = client.post(
        "/api/guest/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 13, 13, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 13, 14, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "guest_full_name": "Test User",
            "guest_email": "testi@mailinator.com",
            "guest_phone": "1231231234",
            "guest_company_name": "test",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == BookingRequestStatus.REQUESTED.value
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == body["public_id"]).one()
    assert req.is_guest_checkout is True
    assert req.user_id is None
    assert req.guest_email == "testi@mailinator.com"


def test_guest_booking_request_rejects_rewards_redemption(db_session, client_factory):
    _owner, space = _seed_owner_space(db_session)

    client = client_factory({})
    resp = client.post(
        "/api/guest/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 14, 13, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 14, 14, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "guest_full_name": "Test User",
            "guest_email": "testi@mailinator.com",
            "redemption_lock_public_id": "lock_1",
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Rewards redemption requires a member account"


def test_guest_booking_request_hides_inactive_location_and_pending_owner(db_session, client_factory):
    _owner, space = _seed_owner_space(db_session)
    location = db_session.query(Location).filter(Location.id == space.location_id).one()
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).one()
    location.status = LocationStatus.INACTIVE
    org.review_status = OrganizationReviewStatus.PENDING
    db_session.add_all([location, org])
    db_session.commit()
    client = client_factory({})

    response = client.post(
        "/api/guest/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 16, 13, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 16, 14, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "guest_full_name": "Test User",
            "guest_email": "testi@mailinator.com",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Space not found"
    assert db_session.query(BookingRequest).filter(BookingRequest.space_id == space.id).count() == 0


def test_guest_booking_request_rejects_buffered_booking_conflict(db_session, client_factory):
    _owner, space = _seed_owner_space(db_session)
    _seed_owner_payment_setting(db_session, space)
    booking = Booking(
        user_id=1,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=datetime(2026, 5, 15, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 15, 11, 0, tzinfo=timezone.utc),
        inventory_start_datetime=datetime(2026, 5, 15, 10, 0, tzinfo=timezone.utc),
        inventory_end_datetime=datetime(2026, 5, 15, 11, 15, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()

    client = client_factory({})
    resp = client.post(
        "/api/guest/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 15, 11, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 15, 12, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "guest_full_name": "Test User",
            "guest_email": "testi@mailinator.com",
        },
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == "Booking overlaps existing booking"


def test_booking_request_approve_creates_booking(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust2@example.com",
        auth_subject="sub-member-2",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

    member_client = client_factory({
        "sub": "sub-member-2",
        "email": member.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 2, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 2, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
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
    assert approved["approved_at"] is not None

    booking = db_session.query(Booking).filter(Booking.id == approved["booking_id"]).first()
    assert booking is not None
    assert booking.status == BookingStatus.CONFIRMED


def test_shared_desk_day_pass_approval_survives_confirmation_email_failure(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    space.name = "shared office"
    space.space_type = SpaceType.SHARED_DESK
    space.capacity = 8
    space.price_daily = 200
    space.price_hourly = None
    space.availability_start_time = time(8, 0)
    space.availability_end_time = time(18, 0)
    db_session.add(space)
    db_session.commit()
    member = User(
        email="tester+clerk_test@mailinto.com",
        auth_subject="sub-shared-approval",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post(
        "/api/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 31, 8, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 31, 18, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "day_pass",
            "full_day": True,
            "member_owner_payment_method_public_id": method.public_id,
            "payment_authorization_consent": True,
        },
    )
    assert create.status_code == 200, create.text

    def raise_email_failure(*_args, **_kwargs):
        raise RuntimeError("template render failed")

    monkeypatch.setattr("app.api.booking_requests.send_booking_confirmed_email", raise_email_failure)
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(
        f"/api/booking-requests/{create.json()['public_id']}/approve",
        json={"operator_notes": "ok"},
    )

    assert approve.status_code == 200, approve.text
    approved = approve.json()
    assert approved["status"] == BookingRequestStatus.APPROVED.value
    assert approved["booking_id"] is not None
    booking = db_session.query(Booking).filter(Booking.id == approved["booking_id"]).first()
    assert booking is not None
    assert booking.status == BookingStatus.CONFIRMED


def test_shared_desk_day_pass_approvals_use_pooled_capacity(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    space.space_type = SpaceType.SHARED_DESK
    space.capacity = 4
    space.price_daily = 200
    space.price_hourly = None
    space.availability_start_time = time(9, 0)
    space.availability_end_time = time(18, 0)
    db_session.add(space)
    db_session.commit()

    member = User(
        email="shared-capacity@example.com",
        auth_subject="sub-shared-capacity",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 6, 1, 18, 0, tzinfo=timezone.utc).isoformat(),
        "booking_mode": "day_pass",
        "full_day": True,
        "seats_requested": 3,
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    first = member_client.post("/api/booking-requests", json=payload)
    assert first.status_code == 200, first.text
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    first_approve = owner_client.post(
        f"/api/booking-requests/{first.json()['public_id']}/approve",
        json={"operator_notes": "first"},
    )
    assert first_approve.status_code == 200, first_approve.text
    assert first_approve.json()["status"] == BookingRequestStatus.APPROVED.value

    second_member = User(
        email="shared-capacity-two@example.com",
        auth_subject="sub-shared-capacity-two",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(second_member)
    db_session.commit()
    db_session.refresh(second_member)
    second_method = _seed_extra_payment_method(
        db_session,
        second_member,
        space,
        method.owner_payment_setting_id,
        provider_payment_method_id="pm_shared_capacity_two",
        last4="2222",
    )
    payload["seats_requested"] = 1
    payload["member_owner_payment_method_public_id"] = second_method.public_id
    member_client = client_factory({
        "sub": second_member.auth_subject,
        "email": second_member.email,
        "email_verified": True,
    })
    second = member_client.post("/api/booking-requests", json=payload)
    assert second.status_code == 200, second.text
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    second_approve = owner_client.post(
        f"/api/booking-requests/{second.json()['public_id']}/approve",
        json={"operator_notes": "second"},
    )
    assert second_approve.status_code == 200, second_approve.text
    assert second_approve.json()["status"] == BookingRequestStatus.APPROVED.value

    bookings = db_session.query(Booking).filter(Booking.space_id == space.id).all()
    assert len(bookings) == 2
    assert [booking.blocks_inventory for booking in bookings] == [False, False]

    third_member = User(
        email="shared-capacity-three@example.com",
        auth_subject="sub-shared-capacity-three",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(third_member)
    db_session.commit()
    db_session.refresh(third_member)
    third_method = _seed_extra_payment_method(
        db_session,
        third_member,
        space,
        method.owner_payment_setting_id,
        provider_payment_method_id="pm_shared_capacity_three",
        last4="3333",
    )
    payload["seats_requested"] = 1
    payload["member_owner_payment_method_public_id"] = third_method.public_id
    member_client = client_factory({
        "sub": third_member.auth_subject,
        "email": third_member.email,
        "email_verified": True,
    })
    third = member_client.post("/api/booking-requests", json=payload)
    assert third.status_code == 409
    assert "shared desk seats" in third.json()["detail"].lower()


def test_approval_booking_hold_integrity_error_returns_conflict(db_session, client_factory, monkeypatch):
    def raise_integrity_error(*_args, **_kwargs):
        raise IntegrityError("insert", {}, Exception("overlap"))

    monkeypatch.setattr("app.api.booking_requests.create_pending_booking_hold", raise_integrity_error)
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="conflict@example.com",
        auth_subject="sub-conflict",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=17))
    assert create.status_code == 200, create.text
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })

    approve = owner_client.post(
        f"/api/booking-requests/{create.json()['public_id']}/approve",
        json={"operator_notes": "ok"},
    )

    assert approve.status_code == 409
    assert approve.json()["detail"] == "Booking overlaps existing booking"


def test_booking_request_approval_sends_one_calendar_email_and_audits_actor(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    sent = _mock_sendgrid(monkeypatch)
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="calendar-member@example.com",
        auth_subject="sub-calendar-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=4))
    assert create.status_code == 200
    req_id = create.json()["public_id"]
    sent.clear()

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200

    confirmed = [email for email in sent if email["subject"] == "Booking confirmed"]
    assert len(confirmed) == 1
    assert confirmed[0]["personalizations"][0]["to"][0]["email"] == member.email
    assert len(confirmed[0]["attachments"]) == 2
    filenames = {attachment["filename"] for attachment in confirmed[0]["attachments"]}
    types = {attachment["type"] for attachment in confirmed[0]["attachments"]}
    assert any(filename.endswith(".ics") for filename in filenames)
    assert any(filename.endswith(".png") for filename in filenames)
    assert any("text/calendar" in content_type for content_type in types)
    assert "image/png" in types
    assert confirmed[0]["personalizations"][0]["custom_args"]["outbound_public_id"]

    outbounds = _booking_outbounds(db_session, req_id, "booking_confirmed")
    assert len(outbounds) == 1
    assert outbounds[0].email == member.email
    assert outbounds[0].status == "sent"
    assert outbounds[0].source_context["recipient_role"] == "member"

    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_public_id == req_id)
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert audit is not None
    assert audit.action == "booking_request_approved"
    assert audit.actor_id == owner.id
    assert audit.context["actor_email"] == owner.email


def test_booking_request_reject(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust3@example.com",
        auth_subject="sub-member-3",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

    member_client = client_factory({
        "sub": "sub-member-3",
        "email": member.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 3, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 3, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
    req_id = create.json()["public_id"]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    reject = owner_client.post(f"/api/booking-requests/{req_id}/reject", json={"operator_notes": "no"})
    assert reject.status_code == 200
    assert reject.json()["status"] == BookingRequestStatus.REJECTED.value
    assert reject.json()["rejected_at"] is not None


def test_booking_request_rejection_sends_update_without_calendar_attachment(
    db_session,
    client_factory,
    monkeypatch,
):
    sent = _mock_sendgrid(monkeypatch)
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="reject-member@example.com",
        auth_subject="sub-reject-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=5))
    assert create.status_code == 200
    req_id = create.json()["public_id"]
    sent.clear()

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    reject = owner_client.post(f"/api/booking-requests/{req_id}/reject", json={"operator_notes": "no"})
    assert reject.status_code == 200

    updates = [email for email in sent if email["subject"] == "Booking request update"]
    assert len(updates) == 1
    assert updates[0]["personalizations"][0]["to"][0]["email"] == member.email
    assert "attachments" not in updates[0]
    outbounds = _booking_outbounds(db_session, req_id, "booking_rejected")
    assert len(outbounds) == 1
    assert outbounds[0].email == member.email


def test_instant_booking_flag_auto_approves(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    org.booking_approval_mode = "auto"
    db_session.add(org)
    db_session.commit()
    member = User(
        email="cust4@example.com",
        auth_subject="sub-member-4",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

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

    member_client = client_factory({
        "sub": "sub-member-4",
        "email": member.email,
        "email_verified": True
    })
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 4, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 4, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.APPROVED.value
    assert data["booking_id"] is not None


def test_explicit_instant_booking_confirms_and_blocks_overlap(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    org.booking_approval_mode = "auto"
    db_session.add(org)
    db_session.commit()
    member = User(
        email="instant@example.com",
        auth_subject="sub-instant",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-instant",
        "email": member.email,
        "email_verified": True,
    })
    payload = _request_payload(space, method, 13)
    payload["booking_mode"] = "hourly"

    create = member_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    body = create.json()
    assert body["instant_booking"] is True
    assert body["status"] == BookingRequestStatus.APPROVED.value
    assert body["payment_status"] == "succeeded"
    assert body["booking_id"] is not None

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    summary = owner_client.get(f"/api/owner/payout-summary?organization_public_id={org.public_id}")
    assert summary.status_code == 200
    assert summary.json()["gross_cents"] == 10000

    overlap = member_client.post("/api/booking-requests", json=payload)
    assert overlap.status_code == 409, overlap.text


def test_recurring_instant_booking_creates_confirmed_series(db_session, client_factory, monkeypatch):
    _owner, space = _seed_owner_space(db_session)
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    org.booking_approval_mode = "auto"
    db_session.add(
        SpaceSetupFeeItem(
            tenant_id=space.tenant_id,
            space_id=space.id,
            label="Recurring setup",
            amount_cents=5000,
        )
    )
    db_session.add(org)
    db_session.commit()
    captured: dict[str, int] = {}

    class CapturingProvider:
        def charge_saved_method(self, **kwargs):
            captured["amount_cents"] = kwargs["amount_cents"]
            return ChargeResult(status="succeeded", provider_payment_id="pi_recurring", raw_response={"ok": True})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: CapturingProvider())
    member = User(
        email="recurring@example.com",
        auth_subject="sub-recurring",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-recurring",
        "email": member.email,
        "email_verified": True,
    })
    payload = _request_payload(space, method, 14)
    payload["booking_mode"] = "hourly"
    payload["recurrence"] = {"frequency": "weekly", "interval": 1, "count": 3}

    create = member_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    body = create.json()
    assert body["status"] == BookingRequestStatus.APPROVED.value
    assert body["occurrence_count"] == 3
    assert body["booking_series_public_id"] is not None
    assert body["payment_breakdown"]["base_cents"] == 30000
    assert body["payment_breakdown"]["setup_fee_cents"] == 5000
    assert body["payment_breakdown"]["total_cents"] == 35000
    assert captured["amount_cents"] == 35000

    series = db_session.query(BookingSeries).filter(BookingSeries.public_id == body["booking_series_public_id"]).first()
    assert series is not None
    bookings = db_session.query(Booking).filter(Booking.booking_series_id == series.id).all()
    assert len(bookings) == 3
    assert {booking.status for booking in bookings} == {BookingStatus.CONFIRMED}


def test_booking_request_requires_payment_method(db_session, client_factory):
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust5@example.com",
        auth_subject="sub-member-5",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    db_session.add(OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted="sk_test_owner",
    ))
    db_session.commit()

    member_client = client_factory({
        "sub": "sub-member-5",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, None, 5))
    assert create.status_code == 400
    assert "Payment method is required" in create.text


def test_payment_failure_marks_request_payment_failed(db_session, client_factory, monkeypatch):
    class FailingProvider:
        def charge_saved_method(self, **kwargs):
            return ChargeResult(status="failed", failure_reason="declined", raw_response={"resp": "declined"})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FailingProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust6@example.com",
        auth_subject="sub-member-6",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-member-6",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 6))
    req_id = create.json()["public_id"]
    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200
    body = approve.json()
    assert body["status"] == BookingRequestStatus.PAYMENT_FAILED.value
    assert body["payment_status"] == "failed"
    assert body["booking_id"] is not None
    assert body["payment_failed_at"] is not None
    assert body["payment_hold_expires_at"] is not None
    booking = db_session.query(Booking).filter(Booking.id == body["booking_id"]).first()
    assert booking.status == BookingStatus.PENDING


def test_payment_failure_cancel_immediately_cancels_hold(db_session, client_factory, monkeypatch):
    class FailingProvider:
        def charge_saved_method(self, **kwargs):
            return ChargeResult(status="failed", failure_reason="0", raw_response={"resptext": "0"})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FailingProvider())
    owner, space = _seed_owner_space(db_session)
    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    org.booking_approval_mode = "auto"
    org.payment_failure_hold_minutes = 0
    db_session.add(org)
    db_session.commit()
    member = User(
        email="cancel-immediate@example.com",
        auth_subject="sub-cancel-immediate",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 16))

    assert create.status_code == 200
    body = create.json()
    assert body["status"] == BookingRequestStatus.CANCELLED.value
    assert body["payment_status"] == "failed"
    assert body["payment_hold_expires_at"] is not None
    booking = db_session.query(Booking).filter(Booking.id == body["booking_id"]).first()
    assert booking.status == BookingStatus.CANCELED


def test_member_can_update_card_and_retry_own_failed_instant_booking(db_session, client_factory, monkeypatch):
    charged_methods: list[str] = []

    class RecordingProvider:
        def charge_saved_method(self, **kwargs):
            charged_methods.append(kwargs["payment_method"].provider_payment_method_id)
            return ChargeResult(status="succeeded", provider_payment_id="pi_retry_ok", raw_response={"ok": True})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: RecordingProvider())
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="retry-member@example.com",
        auth_subject="sub-retry-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    old_method = _seed_payment_method(db_session, member, space)
    new_method = _seed_extra_payment_method(
        db_session,
        member,
        space,
        old_method.owner_payment_setting_id,
        provider_payment_method_id="pm_new_card",
        last4="4242",
    )
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=datetime(2026, 3, 20, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
        status=BookingRequestStatus.PAYMENT_FAILED,
        payment_status="failed",
        instant_booking=True,
        owner_payment_setting_id=old_method.owner_payment_setting_id,
        payment_provider="stripe",
        member_owner_payment_method_id=old_method.id,
        payment_attempt_count=1,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    member_client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    update = member_client.post(
        f"/api/booking-requests/{req.public_id}/payment-method",
        json={
            "member_owner_payment_method_public_id": new_method.public_id,
            "payment_authorization_consent": True,
        },
    )
    assert update.status_code == 200
    assert update.json()["member_owner_payment_method_public_id"] == new_method.public_id

    retry = member_client.post(f"/api/booking-requests/{req.public_id}/retry-payment", json={})
    assert retry.status_code == 200
    body = retry.json()
    assert body["status"] == BookingRequestStatus.APPROVED.value
    assert body["payment_status"] == "succeeded"
    assert body["booking_id"] is not None
    assert charged_methods == ["pm_new_card"]


def test_member_cannot_retry_non_instant_failed_request(db_session, client_factory):
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="retry-noninstant@example.com",
        auth_subject="sub-retry-noninstant",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=datetime(2026, 3, 21, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 3, 21, 12, 0, tzinfo=timezone.utc),
        status=BookingRequestStatus.PAYMENT_FAILED,
        payment_status="failed",
        instant_booking=False,
        owner_payment_setting_id=method.owner_payment_setting_id,
        payment_provider="stripe",
        member_owner_payment_method_id=method.id,
        payment_attempt_count=1,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    member_client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    retry = member_client.post(f"/api/booking-requests/{req.public_id}/retry-payment", json={})

    assert retry.status_code == 400
    assert "Only instant booking" in retry.json()["detail"]


def test_retry_after_payment_hold_expiry_is_rejected_and_cancels_hold(db_session, client_factory, monkeypatch):
    class RecordingProvider:
        def charge_saved_method(self, **kwargs):
            raise AssertionError("expired holds must not charge")

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: RecordingProvider())
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="expired-retry@example.com",
        auth_subject="sub-expired-retry",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=datetime(2026, 3, 22, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 3, 22, 12, 0, tzinfo=timezone.utc),
        inventory_start_datetime=datetime(2026, 3, 22, 10, 0, tzinfo=timezone.utc),
        inventory_end_datetime=datetime(2026, 3, 22, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.PENDING,
    )
    db_session.add(booking)
    db_session.flush()
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        booking_id=booking.id,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        status=BookingRequestStatus.PAYMENT_FAILED,
        payment_status="failed",
        instant_booking=True,
        owner_payment_setting_id=method.owner_payment_setting_id,
        payment_provider="stripe",
        member_owner_payment_method_id=method.id,
        payment_attempt_count=1,
        payment_hold_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        payment_failed_at=datetime.now(timezone.utc) - timedelta(minutes=31),
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    member_client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    retry = member_client.post(f"/api/booking-requests/{req.public_id}/retry-payment", json={})

    assert retry.status_code == 400
    assert "Payment recovery window expired" in retry.json()["detail"]
    db_session.refresh(req)
    db_session.refresh(booking)
    assert req.status == BookingRequestStatus.CANCELLED
    assert booking.status == BookingStatus.CANCELED


def test_owner_retry_non_instant_failed_request_uses_member_updated_card(db_session, client_factory, monkeypatch):
    charged_methods: list[str] = []

    class RecordingProvider:
        def charge_saved_method(self, **kwargs):
            charged_methods.append(kwargs["payment_method"].provider_payment_method_id)
            return ChargeResult(status="succeeded", provider_payment_id="pi_owner_retry_ok", raw_response={"ok": True})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: RecordingProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="owner-retry-member@example.com",
        auth_subject="sub-owner-retry-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    old_method = _seed_payment_method(db_session, member, space)
    new_method = _seed_extra_payment_method(
        db_session,
        member,
        space,
        old_method.owner_payment_setting_id,
        provider_payment_method_id="pm_owner_retry_new",
        last4="5555",
    )
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=datetime(2026, 8, 20, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc),
        status=BookingRequestStatus.PAYMENT_FAILED,
        payment_status="failed",
        instant_booking=False,
        owner_payment_setting_id=old_method.owner_payment_setting_id,
        payment_provider="stripe",
        member_owner_payment_method_id=old_method.id,
        payment_attempt_count=1,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    member_client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    update = member_client.post(
        f"/api/booking-requests/{req.public_id}/payment-method",
        json={
            "member_owner_payment_method_public_id": new_method.public_id,
            "payment_authorization_consent": True,
        },
    )
    assert update.status_code == 200

    owner_client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})
    retry = owner_client.post(f"/api/booking-requests/{req.public_id}/retry-payment", json={})

    assert retry.status_code == 200
    body = retry.json()
    assert body["status"] == BookingRequestStatus.APPROVED.value
    assert body["payment_status"] == "succeeded"
    assert charged_methods == ["pm_owner_retry_new"]


def test_provider_switch_does_not_break_frozen_request(db_session, client_factory, monkeypatch):
    seen_providers: list[str] = []

    class RecordingProvider:
        def __init__(self, provider: str):
            self.provider = provider

        def charge_saved_method(self, **kwargs):
            seen_providers.append(self.provider)
            return ChargeResult(status="succeeded", provider_payment_id="pi_frozen", raw_response={"ok": True})

    monkeypatch.setattr(
        "app.services.booking_payments.PaymentProviderFactory.get",
        lambda setting: RecordingProvider(setting.provider),
    )
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust7@example.com",
        auth_subject="sub-member-7",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-member-7",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 7))
    req_id = create.json()["public_id"]

    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    org.payment_provider = "cardpointe"
    db_session.add(org)
    db_session.add(OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="cardpointe",
        is_enabled=True,
        cardpointe_merchant_id="mid",
    ))
    db_session.commit()

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200
    assert approve.json()["status"] == BookingRequestStatus.APPROVED.value
    assert seen_providers == ["stripe"]


def test_double_approval_charges_once(db_session, client_factory, monkeypatch):
    charge_count = {"count": 0}

    class CountingProvider:
        def charge_saved_method(self, **kwargs):
            charge_count["count"] += 1
            return ChargeResult(status="succeeded", provider_payment_id="pi_once", raw_response={"ok": True})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: CountingProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust8@example.com",
        auth_subject="sub-member-8",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-member-8",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 8))
    req_id = create.json()["public_id"]
    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    first = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    second = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["booking_id"] == second.json()["booking_id"]
    assert charge_count["count"] == 1


def test_approved_request_supersedes_dirty_duplicate_pending_request(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="dirty-duplicate@example.com",
        auth_subject="sub-dirty-duplicate",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 9))
    assert create.status_code == 200, create.text
    req_id = create.json()["public_id"]
    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200, approve.text

    approved_req = db_session.query(BookingRequest).filter(BookingRequest.public_id == req_id).one()
    duplicate = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        owner_payment_setting_id=method.owner_payment_setting_id,
        member_owner_payment_method_id=method.id,
        payment_provider="stripe",
        payment_status="not_charged",
        start_datetime=approved_req.start_datetime,
        end_datetime=approved_req.end_datetime,
        status=BookingRequestStatus.REQUESTED,
    )
    db_session.add(duplicate)
    db_session.flush()
    duplicate_hold = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=approved_req.start_datetime,
        end_datetime=approved_req.end_datetime,
        inventory_start_datetime=approved_req.start_datetime,
        inventory_end_datetime=approved_req.end_datetime,
        booking_request_id=duplicate.id,
        status=BookingStatus.PENDING,
        blocks_inventory=True,
    )
    db_session.add(duplicate_hold)
    db_session.flush()
    duplicate.booking_id = duplicate_hold.id
    db_session.add(duplicate)
    db_session.commit()
    duplicate_public_id = duplicate.public_id
    duplicate_booking_id = duplicate_hold.id

    repeat = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})

    assert repeat.status_code == 200, repeat.text
    db_session.expire_all()
    duplicate = db_session.query(BookingRequest).filter(BookingRequest.public_id == duplicate_public_id).one()
    duplicate_hold = db_session.query(Booking).filter(Booking.id == duplicate_booking_id).one()
    assert duplicate.status == BookingRequestStatus.CANCELLED
    assert duplicate.cancelled_at is not None
    assert duplicate.payment_status == "not_charged"
    assert f"Superseded by confirmed booking request {req_id}" in duplicate.operator_notes
    assert duplicate_hold.status == BookingStatus.CANCELED
    audit = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.entity_public_id == duplicate_public_id,
            AuditLog.action == "booking_request_superseded",
        )
        .one()
    )
    assert audit.actor_id == owner.id
    assert audit.after_state["superseded_by"] == req_id
