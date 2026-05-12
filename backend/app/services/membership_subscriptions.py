"""Stripe Subscription create/cancel for membership purchases.

This module is the seam tests monkeypatch to avoid hitting Stripe. Production
implementations live below `_create_stripe_subscription_real`; tests replace
`StripeSubscriptionClient.create` with a fake that returns a `StripeSubscriptionResult`.
"""
from __future__ import annotations

from dataclasses import dataclass

import stripe

from app.core.crypto import decrypt_secret
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.membership_plan import MembershipPlan
from app.models.owner_payment_setting import OwnerPaymentSetting


class MembershipBillingError(RuntimeError):
    pass


@dataclass
class StripeSubscriptionResult:
    subscription_id: str
    status: str
    current_period_start_unix: int | None = None
    current_period_end_unix: int | None = None
    raw: dict | None = None


class StripeSubscriptionClient:
    """Wrapper around the Stripe Subscription API. Replaceable in tests."""

    def __init__(self, setting: OwnerPaymentSetting):
        if setting.provider != "stripe":
            raise MembershipBillingError(
                "Recurring memberships require Stripe; CardPointe is not supported in v1"
            )
        self.secret_key = decrypt_secret(setting.stripe_secret_key_encrypted)
        if not self.secret_key:
            raise MembershipBillingError("Stripe secret key is required")

    def ensure_price_id(self, plan: MembershipPlan) -> str:
        if plan.stripe_price_id:
            return plan.stripe_price_id
        product = stripe.Product.create(
            name=plan.name,
            metadata={"membership_plan_public_id": plan.public_id},
            api_key=self.secret_key,
        )
        price = stripe.Price.create(
            product=product.id,
            unit_amount=plan.price_cents,
            currency="usd",
            recurring={"interval": "month"},
            api_key=self.secret_key,
        )
        return price.id

    def create(
        self,
        *,
        plan: MembershipPlan,
        payment_method: MemberOwnerPaymentMethod,
        commitment_months: int | None,
        metadata: dict[str, str] | None = None,
    ) -> StripeSubscriptionResult:
        if not payment_method.provider_customer_id or not payment_method.provider_payment_method_id:
            raise MembershipBillingError("Member payment method is incomplete")
        price_id = self.ensure_price_id(plan)
        kwargs: dict = {
            "customer": payment_method.provider_customer_id,
            "items": [{"price": price_id}],
            "default_payment_method": payment_method.provider_payment_method_id,
            "metadata": metadata or {},
            "api_key": self.secret_key,
        }
        if commitment_months and commitment_months > 1:
            # Stripe doesn't enforce minimums natively; we record it as metadata
            # and enforce on the member cancellation path.
            kwargs["metadata"] = {
                **kwargs["metadata"],
                "commitment_months": str(commitment_months),
            }
        sub = stripe.Subscription.create(**kwargs)
        raw = sub.to_dict_recursive() if hasattr(sub, "to_dict_recursive") else dict(sub)
        return StripeSubscriptionResult(
            subscription_id=sub.id,
            status=sub.status,
            current_period_start_unix=getattr(sub, "current_period_start", None),
            current_period_end_unix=getattr(sub, "current_period_end", None),
            raw=raw,
        )

    def cancel(self, subscription_id: str) -> None:
        stripe.Subscription.delete(subscription_id, api_key=self.secret_key)


def create_subscription(
    *,
    setting: OwnerPaymentSetting,
    plan: MembershipPlan,
    payment_method: MemberOwnerPaymentMethod,
    commitment_months: int | None,
    metadata: dict[str, str] | None = None,
) -> StripeSubscriptionResult:
    """Indirection point: tests monkeypatch this whole function."""
    client = StripeSubscriptionClient(setting)
    result = client.create(
        plan=plan,
        payment_method=payment_method,
        commitment_months=commitment_months,
        metadata=metadata,
    )
    # Cache the price id back onto the plan for next purchase.
    if not plan.stripe_price_id:
        plan.stripe_price_id = client.ensure_price_id(plan)
    return result


__all__ = [
    "MembershipBillingError",
    "StripeSubscriptionClient",
    "StripeSubscriptionResult",
    "create_subscription",
]
