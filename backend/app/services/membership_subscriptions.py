"""Stripe Subscription create/cancel for membership purchases.

This module is the seam tests monkeypatch to avoid hitting Stripe. Production
implementations live below `_create_stripe_subscription_real`; tests replace
`StripeSubscriptionClient.create` with a fake that returns a `StripeSubscriptionResult`.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import stripe

from app.core.crypto import decrypt_secret
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.membership_plan import MembershipPlan
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.services.payment_providers import stripe_object_to_dict


logger = logging.getLogger(__name__)


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
        return _stripe_subscription_result(sub)

    def find_existing_by_booking_request(
        self,
        *,
        booking_request_public_id: str,
        payment_method: MemberOwnerPaymentMethod,
    ) -> StripeSubscriptionResult | None:
        search = getattr(stripe.Subscription, "search", None)
        if not callable(search):
            return None
        try:
            results = search(
                query=f"metadata['booking_request_public_id']:'{booking_request_public_id}'",
                limit=10,
                api_key=self.secret_key,
            )
        except Exception as exc:
            logger.warning(
                "stripe_subscription_search_failed",
                extra={
                    "booking_request_public_id": booking_request_public_id,
                    "error": str(exc),
                },
            )
            return None

        raw_results = stripe_object_to_dict(results)
        rows = raw_results.get("data") or []
        for row in rows:
            if not isinstance(row, dict):
                continue
            if row.get("customer") != payment_method.provider_customer_id:
                continue
            if row.get("status") in {"canceled", "incomplete_expired"}:
                continue
            subscription_id = row.get("id")
            if not subscription_id:
                continue
            return StripeSubscriptionResult(
                subscription_id=subscription_id,
                status=row.get("status") or "unknown",
                current_period_start_unix=_optional_int(row.get("current_period_start")),
                current_period_end_unix=_optional_int(row.get("current_period_end")),
                raw=row,
            )
        return None

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
    booking_request_public_id = (metadata or {}).get("booking_request_public_id")
    if booking_request_public_id:
        existing = client.find_existing_by_booking_request(
            booking_request_public_id=booking_request_public_id,
            payment_method=payment_method,
        )
        if existing:
            if not plan.stripe_price_id:
                plan.stripe_price_id = _subscription_price_id(existing.raw)
            return existing
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


def _optional_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _stripe_subscription_result(sub: Any) -> StripeSubscriptionResult:
    raw = stripe_object_to_dict(sub)
    return StripeSubscriptionResult(
        subscription_id=(raw.get("id") or getattr(sub, "id", "")),
        status=(raw.get("status") or getattr(sub, "status", "unknown")),
        current_period_start_unix=_optional_int(
            raw.get("current_period_start") or getattr(sub, "current_period_start", None)
        ),
        current_period_end_unix=_optional_int(
            raw.get("current_period_end") or getattr(sub, "current_period_end", None)
        ),
        raw=raw,
    )


def _subscription_price_id(raw: dict | None) -> str | None:
    if not raw:
        return None
    items = raw.get("items") or {}
    rows = items.get("data") if isinstance(items, dict) else None
    if not rows:
        return None
    first = rows[0]
    if not isinstance(first, dict):
        return None
    price = first.get("price") or {}
    if isinstance(price, dict):
        return price.get("id")
    return price if isinstance(price, str) else None


__all__ = [
    "MembershipBillingError",
    "StripeSubscriptionClient",
    "StripeSubscriptionResult",
    "create_subscription",
]
