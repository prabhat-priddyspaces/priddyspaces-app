from datetime import datetime, timezone

from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import AvailabilityStatus, BookingRequestStatus, PaymentStatus, SpaceType, UserAppRole, UserRole
from app.models.location import Location
from app.models.loyalty import LoyaltyWallet, PriddyPointsWallet
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.space import Space
from app.models.user import User
from app.services.loyalty import get_or_create_wallet, grant_priddy_signup_points, write_ledger_entry
from app.services.payment_providers import ChargeResult


def _seed(db, *, space_type=SpaceType.CONFERENCE_ROOM):
    owner = User(
        email="loyalty-owner@example.com",
        auth_subject="loyalty-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    customer = User(
        email="loyalty-member@example.com",
        auth_subject="loyalty-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db.add_all([owner, customer])
    db.commit()
    db.refresh(owner)
    db.refresh(customer)

    org = Organization(name="Loyalty Org", owner_id=owner.id)
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
        name="Main",
        address="123 Main",
        city="Testville",
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
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
        price_hourly=50,
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
        user_id=customer.id,
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        owner_payment_setting_id=setting.id,
        provider_customer_id="cus_loyalty",
        provider_payment_method_id="pm_loyalty",
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
    return owner, customer, org, space, method


class LoyaltyProvider:
    def __init__(self):
        self.amounts: list[int] = []

    def charge_saved_method(self, **kwargs):
        self.amounts.append(kwargs["amount_cents"])
        return ChargeResult(status="succeeded", provider_payment_id="pi_loyalty", raw_response={"ok": True})

    def void_or_refund(self, **kwargs):
        return ChargeResult(status="refunded", provider_reference_id="refund_loyalty", raw_response={"refunded": True})


def _grant_points(db, org: Organization, customer: User, points: int):
    wallet = get_or_create_wallet(db, org, customer)
    write_ledger_entry(
        db,
        wallet,
        entry_type="manual_adjustment",
        point_type="promo",
        points=points,
        source="test",
        note="seed promo points",
    )
    db.commit()
    db.refresh(wallet)
    return wallet


def test_redemption_discount_earn_and_refund_reversal(db_session, client_factory, monkeypatch):
    provider = LoyaltyProvider()
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: provider)
    owner, customer, org, space, method = _seed(db_session)
    _grant_points(db_session, org, customer, 1000)

    owner_client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})
    settings = owner_client.put(
        f"/api/loyalty/settings?organization_public_id={org.public_id}",
        json={"earn_rate_bps": 200, "max_redemption_percent": 50},
    )
    assert settings.status_code == 200
    assert settings.json()["earn_points_per_dollar"] == 2

    customer_client = client_factory({"sub": customer.auth_subject, "email": customer.email, "email_verified": True})
    booking_payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 6, 5, 9, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 6, 5, 17, 0, tzinfo=timezone.utc).isoformat(),
        "booking_mode": "day_pass",
        "full_day": True,
    }
    preview = customer_client.post("/api/loyalty/redemptions/preview", json=booking_payload)
    assert preview.status_code == 200
    assert preview.json()["eligible"] is True
    assert preview.json()["max_redeemable_points"] == 1000

    lock = customer_client.post(
        "/api/loyalty/redemptions/lock",
        json={**booking_payload, "points_requested": 500},
    )
    assert lock.status_code == 200
    assert lock.json()["discount_cents"] == 500

    create = customer_client.post(
        "/api/booking-requests",
        json={
            **booking_payload,
            "member_owner_payment_method_public_id": method.public_id,
            "payment_authorization_consent": True,
            "redemption_lock_public_id": lock.json()["public_id"],
        },
    )
    assert create.status_code == 200
    req_id = create.json()["public_id"]

    owner_client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200
    assert approve.json()["status"] == BookingRequestStatus.APPROVED.value
    assert provider.amounts == [19500]

    wallet = db_session.query(LoyaltyWallet).filter(
        LoyaltyWallet.organization_id == org.id,
        LoyaltyWallet.user_id == customer.id,
    ).first()
    assert wallet is not None
    assert wallet.promo_balance == 500
    assert wallet.earned_balance == 390

    cancel = customer_client.post(f"/api/booking-requests/{req_id}/cancel")
    assert cancel.status_code == 200
    payment = db_session.query(Payment).filter(Payment.user_id == customer.id).first()
    assert payment is not None
    assert payment.status == PaymentStatus.REFUNDED
    db_session.refresh(wallet)
    assert wallet.promo_balance == 1000
    assert wallet.earned_balance == 0


def test_private_office_redemption_is_blocked(db_session, client_factory):
    _owner, customer, org, space, _method = _seed(db_session, space_type=SpaceType.PRIVATE_OFFICE)
    _grant_points(db_session, org, customer, 1000)
    customer_client = client_factory({"sub": customer.auth_subject, "email": customer.email, "email_verified": True})

    preview = customer_client.post(
        "/api/loyalty/redemptions/preview",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 6, 6, 9, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 6, 6, 17, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "day_pass",
            "full_day": True,
        },
    )
    assert preview.status_code == 200
    assert preview.json()["eligible"] is False
    assert "space type" in preview.json()["reason"]


def test_member_registration_gets_priddy_points(db_session, client_factory):
    client = client_factory({"sub": "unused", "email": "unused@example.com", "email_verified": True})

    response = client.post(
        "/auth/register",
        json={
            "email": "new-member@example.com",
            "password": "Password123!",
            "first_name": "New",
            "last_name": "Member",
            "role": "member",
            "terms_accepted": True,
            "privacy_policy_accepted": True,
        },
    )

    assert response.status_code == 200
    wallet = db_session.query(PriddyPointsWallet).join(User, User.id == PriddyPointsWallet.user_id).filter(
        User.email == "new-member@example.com"
    ).first()
    assert wallet is not None
    assert wallet.balance == 1000


def test_priddy_points_cover_day_pass_without_card(db_session, client_factory):
    owner, customer, org, space, _method = _seed(db_session, space_type=SpaceType.SHARED_DESK)
    space.price_daily = 10
    db_session.add(space)
    grant_priddy_signup_points(db_session, customer)
    db_session.commit()

    owner_client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})
    settings = owner_client.put(
        f"/api/loyalty/settings?organization_public_id={org.public_id}",
        json={"accepts_priddy_points": True},
    )
    assert settings.status_code == 200

    customer_client = client_factory({"sub": customer.auth_subject, "email": customer.email, "email_verified": True})
    booking_payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 6, 7, 9, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 6, 7, 17, 0, tzinfo=timezone.utc).isoformat(),
        "booking_mode": "day_pass",
        "full_day": True,
    }

    preview = customer_client.post("/api/loyalty/redemptions/preview", json=booking_payload)
    assert preview.status_code == 200
    assert preview.json()["priddy"]["eligible"] is True
    assert preview.json()["priddy"]["max_redeemable_points"] == 1000

    lock = customer_client.post(
        "/api/loyalty/redemptions/lock",
        json={**booking_payload, "priddy_points_requested": 1000},
    )
    assert lock.status_code == 200
    assert lock.json()["discount_cents"] == 1000

    create = customer_client.post(
        "/api/booking-requests",
        json={**booking_payload, "redemption_lock_public_id": lock.json()["public_id"]},
    )
    assert create.status_code == 200
    assert create.json()["status"] == BookingRequestStatus.APPROVED.value
    assert create.json()["payment_status"] == "succeeded"
    priddy_wallet = db_session.query(PriddyPointsWallet).filter(PriddyPointsWallet.user_id == customer.id).first()
    assert priddy_wallet is not None
    db_session.refresh(priddy_wallet)
    assert priddy_wallet.balance == 0
