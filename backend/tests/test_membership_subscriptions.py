from __future__ import annotations

from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.membership_plan import MembershipPlan
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.services.membership_subscriptions import create_subscription


def _stripe_setting() -> OwnerPaymentSetting:
    return OwnerPaymentSetting(
        organization_id=1,
        tenant_id=1,
        provider="stripe",
        is_enabled=True,
        stripe_secret_key_encrypted="sk_test",
    )


def _plan(**overrides) -> MembershipPlan:
    values = {
        "tenant_id": 1,
        "organization_id": 1,
        "space_id": 1,
        "booking_mode": "private_office_lease",
        "name": "12-month Lease",
        "price_cents": 100000,
        "billing_cycle": "monthly",
        "stripe_price_id": "price_existing",
        "is_active": True,
    }
    values.update(overrides)
    return MembershipPlan(**values)


def _method() -> MemberOwnerPaymentMethod:
    return MemberOwnerPaymentMethod(
        user_id=1,
        organization_id=1,
        tenant_id=1,
        provider="stripe",
        owner_payment_setting_id=1,
        provider_customer_id="cus_1",
        provider_payment_method_id="pm_1",
        status="active",
    )


def test_create_subscription_serializes_to_dict_only_subscription(monkeypatch):
    captured: dict = {}

    class ToDictOnlySubscription:
        id = "sub_to_dict"
        status = "active"
        current_period_start = 100
        current_period_end = 200

        def to_dict(self):
            return {
                "id": self.id,
                "status": self.status,
                "current_period_start": self.current_period_start,
                "current_period_end": self.current_period_end,
            }

        def __iter__(self):
            raise AssertionError("dict(stripe_subscription) should not be used")

    def fake_create(**kwargs):
        captured.update(kwargs)
        return ToDictOnlySubscription()

    monkeypatch.setattr(
        "app.services.membership_subscriptions.stripe.Subscription.create",
        fake_create,
    )

    result = create_subscription(
        setting=_stripe_setting(),
        plan=_plan(),
        payment_method=_method(),
        commitment_months=12,
        metadata={"booking_request_public_id": ""},
    )

    assert result.subscription_id == "sub_to_dict"
    assert result.status == "active"
    assert result.current_period_start_unix == 100
    assert result.current_period_end_unix == 200
    assert result.raw == {
        "id": "sub_to_dict",
        "status": "active",
        "current_period_start": 100,
        "current_period_end": 200,
    }
    assert captured["customer"] == "cus_1"
    assert captured["default_payment_method"] == "pm_1"
    assert captured["metadata"]["commitment_months"] == "12"


def test_create_subscription_adds_setup_fees_to_first_invoice(monkeypatch):
    captured: dict = {}
    products: list[dict] = []

    class Product:
        id = "prod_setup"

    class Subscription:
        id = "sub_with_setup"
        status = "active"

        def to_dict(self):
            return {"id": self.id, "status": self.status}

    def fake_product_create(**kwargs):
        products.append(kwargs)
        return Product()

    def fake_subscription_create(**kwargs):
        captured.update(kwargs)
        return Subscription()

    monkeypatch.setattr(
        "app.services.membership_subscriptions.stripe.Product.create",
        fake_product_create,
    )
    monkeypatch.setattr(
        "app.services.membership_subscriptions.stripe.Subscription.create",
        fake_subscription_create,
    )

    result = create_subscription(
        setting=_stripe_setting(),
        plan=_plan(),
        payment_method=_method(),
        commitment_months=12,
        setup_fee_items=[
            {"label": "Office setup", "amount_cents": 15000, "type": "setup_fee"},
            {"label": "Keys", "amount_cents": 5000, "type": "setup_fee"},
        ],
        metadata={"membership_plan_public_id": "plan_1"},
    )

    assert result.subscription_id == "sub_with_setup"
    assert [product["name"] for product in products] == ["Office setup", "Keys"]
    assert captured["add_invoice_items"] == [
        {
            "price_data": {
                "currency": "usd",
                "product": "prod_setup",
                "unit_amount": 15000,
            },
            "quantity": 1,
            "metadata": {
                "membership_plan_public_id": "plan_1",
                "setup_fee": "true",
                "setup_fee_label": "Office setup",
            },
        },
        {
            "price_data": {
                "currency": "usd",
                "product": "prod_setup",
                "unit_amount": 5000,
            },
            "quantity": 1,
            "metadata": {
                "membership_plan_public_id": "plan_1",
                "setup_fee": "true",
                "setup_fee_label": "Keys",
            },
        },
    ]


def test_create_subscription_reuses_existing_subscription_by_booking_request(monkeypatch):
    plan = _plan(stripe_price_id=None)

    class SearchResult:
        def to_dict(self):
            return {
                "data": [
                    {
                        "id": "sub_existing",
                        "status": "active",
                        "customer": "cus_1",
                        "current_period_start": 111,
                        "current_period_end": 222,
                        "items": {"data": [{"price": {"id": "price_from_existing"}}]},
                    }
                ]
            }

    monkeypatch.setattr(
        "app.services.membership_subscriptions.stripe.Subscription.search",
        lambda **_kwargs: SearchResult(),
        raising=False,
    )
    monkeypatch.setattr(
        "app.services.membership_subscriptions.stripe.Subscription.create",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("new subscription should not be created")
        ),
    )

    result = create_subscription(
        setting=_stripe_setting(),
        plan=plan,
        payment_method=_method(),
        commitment_months=12,
        metadata={"booking_request_public_id": "req_123"},
    )

    assert result.subscription_id == "sub_existing"
    assert result.status == "active"
    assert result.current_period_start_unix == 111
    assert result.current_period_end_unix == 222
    assert plan.stripe_price_id == "price_from_existing"
