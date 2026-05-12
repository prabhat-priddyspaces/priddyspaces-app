"""Unit tests for the payment provider abstraction.

Covers:
- PaymentProviderFactory dispatch
- StripePaymentProvider.charge_saved_method validation
- CardPointePaymentProvider response parsing (respstat A vs N, respcode mapping)
- CardPointe failure_reason mapping for known codes
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.services.payment_providers import (
    CardPointePaymentProvider,
    CARDPOINTE_RESPCODE_MESSAGES,
    PaymentProviderError,
    PaymentProviderFactory,
    StripePaymentProvider,
    _cardpointe_failure_reason,
)


def _stripe_setting() -> OwnerPaymentSetting:
    setting = OwnerPaymentSetting(
        organization_id=1,
        tenant_id=1,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_x",
        stripe_secret_key_encrypted="sk_test_x",
    )
    return setting


def _cardpointe_setting() -> OwnerPaymentSetting:
    return OwnerPaymentSetting(
        organization_id=1,
        tenant_id=1,
        provider="cardpointe",
        is_enabled=True,
        cardpointe_merchant_id="merchant_1",
        cardpointe_username_encrypted="api-user",
        cardpointe_password_encrypted="api-pass",
        cardpointe_site="https://cp.test",
    )


def test_factory_dispatches_stripe():
    provider = PaymentProviderFactory.get(_stripe_setting())
    assert isinstance(provider, StripePaymentProvider)
    assert provider.provider == "stripe"


def test_factory_dispatches_cardpointe():
    provider = PaymentProviderFactory.get(_cardpointe_setting())
    assert isinstance(provider, CardPointePaymentProvider)
    assert provider.provider == "cardpointe"


def test_factory_rejects_unknown_provider():
    setting = OwnerPaymentSetting(
        organization_id=1, tenant_id=1, provider="paypal", is_enabled=True
    )
    with pytest.raises(PaymentProviderError):
        PaymentProviderFactory.get(setting)


def test_stripe_charge_requires_pm_and_customer():
    provider = StripePaymentProvider(_stripe_setting())
    incomplete = MemberOwnerPaymentMethod(
        user_id=1,
        organization_id=1,
        tenant_id=1,
        provider="stripe",
        owner_payment_setting_id=1,
        provider_customer_id=None,
        provider_payment_method_id=None,
        status="active",
    )
    with pytest.raises(PaymentProviderError):
        provider.charge_saved_method(
            payment_method=incomplete,
            amount_cents=1000,
            currency="usd",
            idempotency_key="key_1",
        )


def test_cardpointe_charge_approved_response():
    provider = CardPointePaymentProvider(_cardpointe_setting())
    method = MemberOwnerPaymentMethod(
        user_id=1,
        organization_id=1,
        tenant_id=1,
        provider="cardpointe",
        owner_payment_setting_id=1,
        card_token="tok_4242",
        status="active",
    )
    fake_response = {
        "respstat": "A",
        "respcode": "100",
        "retref": "ref-abc-123",
        "authcode": "auth-1",
        "resptext": "Approval",
    }
    with patch.object(CardPointePaymentProvider, "_post", return_value=fake_response):
        result = provider.charge_saved_method(
            payment_method=method,
            amount_cents=1000,
            currency="usd",
            idempotency_key="booking_x_attempt_1",
        )
    assert result.status == "succeeded"
    assert result.provider_reference_id == "ref-abc-123"


def test_cardpointe_charge_declined_response_maps_respcode():
    provider = CardPointePaymentProvider(_cardpointe_setting())
    method = MemberOwnerPaymentMethod(
        user_id=1,
        organization_id=1,
        tenant_id=1,
        provider="cardpointe",
        owner_payment_setting_id=1,
        card_token="tok_decline",
        status="active",
    )
    fake_response = {
        "respstat": "N",
        "respcode": "103",
        "retref": "ref-fail-1",
        "resptext": "INSUF FUNDS",
    }
    with patch.object(CardPointePaymentProvider, "_post", return_value=fake_response):
        result = provider.charge_saved_method(
            payment_method=method,
            amount_cents=1000,
            currency="usd",
            idempotency_key="booking_x_attempt_1",
        )
    assert result.status == "failed"
    assert "Insufficient funds" in (result.failure_reason or "")


def test_cardpointe_failure_reason_known_code():
    reason = _cardpointe_failure_reason({"respcode": "111", "resptext": "INV CVV"})
    assert "Invalid CVV" in reason


def test_cardpointe_failure_reason_unknown_code_falls_back_to_resptext():
    reason = _cardpointe_failure_reason({"respcode": "999", "resptext": "Mystery"})
    assert reason == "Mystery"


def test_cardpointe_respcode_table_has_essentials():
    # Sanity check that the most common decline codes are documented.
    for code in ("101", "103", "104", "111", "112"):
        assert code in CARDPOINTE_RESPCODE_MESSAGES
