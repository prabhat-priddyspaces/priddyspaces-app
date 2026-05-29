from types import SimpleNamespace

from app.core.config import settings
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import AvailabilityStatus, SpaceType, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.models.user import User


def _user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _unverified_user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = _user(db, email, sub, role)
    user.email_verified = False
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _owner_space(db):
    owner = _user(db, "owner-pay@example.com", "sub-owner-pay", UserAppRole.OWNER)
    org = Organization(name="Pay Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)
    db.add(OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
    ))
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
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, space


def _stripe_setting(db, org: Organization, secret: str = "sk_test_owner") -> OwnerPaymentSetting:
    setting = OwnerPaymentSetting(
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted=secret,
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


def test_owner_payment_settings_and_member_method_scope(db_session, client_factory):
    owner, org, space = _owner_space(db_session)
    member = _user(db_session, "pay-member@example.com", "sub-pay-member", UserAppRole.MEMBER)

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    saved = owner_client.post(
        f"/api/owner/payment-settings?organization_public_id={org.public_id}",
        json={
            "provider": "cardpointe",
            "is_enabled": True,
            "is_test_mode": True,
            "cardpointe_merchant_id": "merchant_123",
            "cardpointe_username": "api-user",
            "cardpointe_password": "api-pass",
            "cardpointe_site": "https://cardpointe.test",
            "cardpointe_tokenizer_url": "https://tokenizer.test",
        },
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["has_cardpointe_username"] is True
    assert body["has_cardpointe_password"] is True
    assert "api-pass" not in saved.text
    setting = db_session.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.organization_id == org.id).one()
    assert setting.cardpointe_username_encrypted.startswith("v2:")
    assert setting.cardpointe_password_encrypted.startswith("v2:")

    owner_client.patch(
        f"/api/owner/payment-provider/organization/{org.public_id}",
        json={"payment_provider": "cardpointe"},
    )

    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    resolved = member_client.get(f"/api/payment-methods/resolve?space_public_id={space.public_id}")
    assert resolved.status_code == 200
    assert resolved.json()["is_configured"] is True
    assert resolved.json()["has_payment_method"] is False

    setup = member_client.post("/api/payment-methods/setup-session", json={"space_public_id": space.public_id})
    assert setup.status_code == 200
    assert setup.json()["tokenizer_url"] == "https://tokenizer.test"

    method = member_client.post(
        "/api/payment-methods",
        json={
            "space_public_id": space.public_id,
            "owner_payment_setting_public_id": setup.json()["owner_payment_setting_public_id"],
            "card_token": "token_abc_4242",
            "last4": "4242",
            "brand": "visa",
            "exp_month": 12,
            "exp_year": 2030,
        },
    )
    assert method.status_code == 200
    assert method.json()["last4"] == "4242"
    assert db_session.query(MemberOwnerPaymentMethod).count() == 1

    resolved = member_client.get(f"/api/payment-methods/resolve?space_public_id={space.public_id}")
    assert resolved.json()["has_payment_method"] is True
    assert resolved.json()["payment_method_public_id"] == method.json()["public_id"]


def test_same_account_stripe_portal_card_imports_for_owner_scope(db_session, client_factory, monkeypatch):
    _owner, org, space = _owner_space(db_session)
    _stripe_setting(db_session, org, secret="sk_platform")
    member = _user(db_session, "portal-card@example.com", "sub-portal-card", UserAppRole.MEMBER)
    member.stripe_customer_id = "cus_platform"
    db_session.add(member)
    db_session.commit()
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_platform")

    def fake_customer_retrieve(*args, **kwargs):
        assert args[0] == "cus_platform"
        return {
            "invoice_settings": {
                "default_payment_method": {
                    "id": "pm_portal_default",
                    "customer": "cus_platform",
                    "card": {"last4": "1111", "brand": "visa", "exp_month": 11, "exp_year": 2034},
                    "billing_details": {"name": "Portal User", "address": {"postal_code": "10001"}},
                }
            }
        }

    monkeypatch.setattr("app.services.owner_payments.stripe.Customer.retrieve", fake_customer_retrieve)
    client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    resolved = client.get(f"/api/payment-methods/resolve?space_public_id={space.public_id}")

    assert resolved.status_code == 200
    body = resolved.json()
    assert body["has_payment_method"] is True
    assert body["reused_platform_payment_method"] is True
    method = db_session.query(MemberOwnerPaymentMethod).one()
    assert method.provider_payment_method_id == "pm_portal_default"
    assert method.provider_customer_id == "cus_platform"
    assert method.last4 == "1111"


def test_mismatched_stripe_account_does_not_import_platform_card(db_session, client_factory, monkeypatch):
    _owner, org, space = _owner_space(db_session)
    _stripe_setting(db_session, org, secret="sk_owner")
    member = _user(db_session, "separate-account@example.com", "sub-separate-account", UserAppRole.MEMBER)
    member.stripe_customer_id = "cus_platform"
    db_session.add(member)
    db_session.commit()
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_platform")

    def fake_account_retrieve(*, api_key):
        return {"id": "acct_platform" if api_key == "sk_platform" else "acct_owner"}

    def fail_customer_retrieve(*args, **kwargs):
        raise AssertionError("Platform cards should not be inspected for a separate owner Stripe account")

    monkeypatch.setattr("app.services.owner_payments.stripe.Account.retrieve", fake_account_retrieve)
    monkeypatch.setattr("app.services.owner_payments.stripe.Customer.retrieve", fail_customer_retrieve)
    client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    resolved = client.get(f"/api/payment-methods/resolve?space_public_id={space.public_id}")

    assert resolved.status_code == 200
    assert resolved.json()["has_payment_method"] is False
    assert db_session.query(MemberOwnerPaymentMethod).count() == 0


def test_same_account_stripe_setup_uses_platform_customer(db_session, client_factory, monkeypatch):
    _owner, org, space = _owner_space(db_session)
    _stripe_setting(db_session, org, secret="sk_platform")
    member = _user(db_session, "setup-platform@example.com", "sub-setup-platform", UserAppRole.MEMBER)
    member.stripe_customer_id = "cus_platform"
    db_session.add(member)
    db_session.commit()
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_platform")
    captured: dict[str, str | None] = {}

    class Provider:
        def create_setup_session(self, user, provider_customer_id=None):
            captured["provider_customer_id"] = provider_customer_id
            return SimpleNamespace(
                provider="stripe",
                provider_customer_id=provider_customer_id,
                client_secret="seti_secret",
                setup_intent_id="seti_1",
                publishable_key="pk_test_owner",
                tokenizer_url=None,
            )

    monkeypatch.setattr("app.api.owner_payments.PaymentProviderFactory.get", lambda setting: Provider())
    client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    response = client.post("/api/payment-methods/setup-session", json={"space_public_id": space.public_id})

    assert response.status_code == 200
    assert captured["provider_customer_id"] == "cus_platform"
    assert response.json()["provider_customer_id"] == "cus_platform"


def test_separate_stripe_account_setup_keeps_owner_customer_scope(db_session, client_factory, monkeypatch):
    _owner, org, space = _owner_space(db_session)
    _stripe_setting(db_session, org, secret="sk_owner")
    member = _user(db_session, "setup-owner@example.com", "sub-setup-owner", UserAppRole.MEMBER)
    member.stripe_customer_id = "cus_platform"
    db_session.add(member)
    db_session.commit()
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "sk_platform")
    captured: dict[str, str | None] = {}

    def fake_account_retrieve(*, api_key):
        return {"id": "acct_platform" if api_key == "sk_platform" else "acct_owner"}

    class Provider:
        def create_setup_session(self, user, provider_customer_id=None):
            captured["provider_customer_id"] = provider_customer_id
            return SimpleNamespace(
                provider="stripe",
                provider_customer_id="cus_owner_new",
                client_secret="seti_secret",
                setup_intent_id="seti_1",
                publishable_key="pk_test_owner",
                tokenizer_url=None,
            )

    monkeypatch.setattr("app.services.owner_payments.stripe.Account.retrieve", fake_account_retrieve)
    monkeypatch.setattr("app.api.owner_payments.PaymentProviderFactory.get", lambda setting: Provider())
    client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    response = client.post("/api/payment-methods/setup-session", json={"space_public_id": space.public_id})

    assert response.status_code == 200
    assert captured["provider_customer_id"] is None
    assert response.json()["provider_customer_id"] == "cus_owner_new"


def test_unverified_member_cannot_start_payment_setup(db_session, client_factory):
    _owner, _org, space = _owner_space(db_session)
    member = _unverified_user(db_session, "unverified-pay@example.com", "sub-pay-unverified", UserAppRole.MEMBER)
    client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": False,
    })

    response = client.post("/api/payment-methods/setup-session", json={"space_public_id": space.public_id})

    assert response.status_code == 403
    assert response.json()["detail"] == "Email verification required before payment"
