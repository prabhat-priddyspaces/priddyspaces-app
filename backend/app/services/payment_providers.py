from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import httpx
import stripe

from app.core.crypto import decrypt_secret
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.user import User


class PaymentProviderError(RuntimeError):
    pass


@dataclass
class SetupSessionResult:
    provider: str
    provider_customer_id: str | None = None
    client_secret: str | None = None
    setup_intent_id: str | None = None
    publishable_key: str | None = None
    tokenizer_url: str | None = None


@dataclass
class SavedPaymentMethodResult:
    provider_customer_id: str | None
    provider_payment_method_id: str | None
    card_token: str | None
    last4: str | None
    brand: str | None
    exp_month: int | None
    exp_year: int | None


@dataclass
class ChargeResult:
    status: str
    provider_payment_id: str | None = None
    provider_reference_id: str | None = None
    raw_response: dict[str, Any] | None = None
    failure_reason: str | None = None


class PaymentProvider(Protocol):
    provider: str

    def create_customer(self, user: User) -> str | None:
        ...

    def create_setup_session(self, user: User, provider_customer_id: str | None = None) -> SetupSessionResult:
        ...

    def save_payment_method(self, payload: dict[str, Any]) -> SavedPaymentMethodResult:
        ...

    def charge_saved_method(
        self,
        *,
        payment_method: MemberOwnerPaymentMethod,
        amount_cents: int,
        currency: str,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> ChargeResult:
        ...

    def void_or_refund(self, *, provider_payment_id: str | None, provider_reference_id: str | None, amount_cents: int | None = None) -> ChargeResult:
        ...

    def get_payment_status(self, provider_payment_id: str) -> ChargeResult:
        ...

    def test_connection(self) -> bool:
        ...


class StripePaymentProvider:
    provider = "stripe"

    def __init__(self, setting: OwnerPaymentSetting):
        self.setting = setting
        self.secret_key = decrypt_secret(setting.stripe_secret_key_encrypted)
        if not self.secret_key:
            raise PaymentProviderError("Stripe secret key is required")

    def create_customer(self, user: User) -> str:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.full_name,
            metadata={"user_public_id": user.public_id},
            api_key=self.secret_key,
        )
        return customer.id

    def create_setup_session(self, user: User, provider_customer_id: str | None = None) -> SetupSessionResult:
        customer_id = provider_customer_id or self.create_customer(user)
        intent = stripe.SetupIntent.create(
            customer=customer_id,
            usage="off_session",
            metadata={"user_public_id": user.public_id},
            api_key=self.secret_key,
        )
        return SetupSessionResult(
            provider=self.provider,
            provider_customer_id=customer_id,
            client_secret=intent.client_secret,
            setup_intent_id=intent.id,
            publishable_key=self.setting.stripe_publishable_key,
        )

    def save_payment_method(self, payload: dict[str, Any]) -> SavedPaymentMethodResult:
        setup_intent_id = payload.get("setup_intent_id")
        payment_method_id = payload.get("provider_payment_method_id")
        customer_id = payload.get("provider_customer_id")
        card_data: dict[str, Any] = {}

        if setup_intent_id:
            setup_intent = stripe.SetupIntent.retrieve(setup_intent_id, api_key=self.secret_key)
            payment_method_id = setup_intent.payment_method or payment_method_id
            customer_id = setup_intent.customer or customer_id
        if payment_method_id:
            try:
                method = stripe.PaymentMethod.retrieve(payment_method_id, api_key=self.secret_key)
                card_data = dict(method.card or {})
                customer_id = method.customer or customer_id
            except Exception:
                card_data = {}

        return SavedPaymentMethodResult(
            provider_customer_id=customer_id,
            provider_payment_method_id=payment_method_id,
            card_token=None,
            last4=card_data.get("last4") or payload.get("last4"),
            brand=card_data.get("brand") or payload.get("brand"),
            exp_month=card_data.get("exp_month") or payload.get("exp_month"),
            exp_year=card_data.get("exp_year") or payload.get("exp_year"),
        )

    def charge_saved_method(
        self,
        *,
        payment_method: MemberOwnerPaymentMethod,
        amount_cents: int,
        currency: str,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> ChargeResult:
        if not payment_method.provider_payment_method_id or not payment_method.provider_customer_id:
            raise PaymentProviderError("Stripe payment method is incomplete")
        try:
            intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency,
                customer=payment_method.provider_customer_id,
                payment_method=payment_method.provider_payment_method_id,
                off_session=True,
                confirm=True,
                metadata=metadata or {},
                api_key=self.secret_key,
                idempotency_key=idempotency_key,
            )
        except stripe.error.StripeError as exc:
            return ChargeResult(status="failed", failure_reason=str(exc), raw_response={"error": str(exc)})
        raw = intent.to_dict_recursive() if hasattr(intent, "to_dict_recursive") else dict(intent)
        if intent.status == "succeeded":
            return ChargeResult(status="succeeded", provider_payment_id=intent.id, raw_response=raw)
        return ChargeResult(status="failed", provider_payment_id=intent.id, raw_response=raw, failure_reason=f"Stripe status {intent.status}")

    def void_or_refund(self, *, provider_payment_id: str | None, provider_reference_id: str | None, amount_cents: int | None = None) -> ChargeResult:
        if not provider_payment_id:
            raise PaymentProviderError("Stripe payment id is required for refund")
        kwargs: dict[str, Any] = {"payment_intent": provider_payment_id, "api_key": self.secret_key}
        if amount_cents is not None:
            kwargs["amount"] = amount_cents
        refund = stripe.Refund.create(**kwargs)
        raw = refund.to_dict_recursive() if hasattr(refund, "to_dict_recursive") else dict(refund)
        return ChargeResult(status="refunded", provider_payment_id=provider_payment_id, provider_reference_id=refund.id, raw_response=raw)

    def get_payment_status(self, provider_payment_id: str) -> ChargeResult:
        intent = stripe.PaymentIntent.retrieve(provider_payment_id, api_key=self.secret_key)
        raw = intent.to_dict_recursive() if hasattr(intent, "to_dict_recursive") else dict(intent)
        return ChargeResult(status=intent.status, provider_payment_id=intent.id, raw_response=raw)

    def test_connection(self) -> bool:
        stripe.Balance.retrieve(api_key=self.secret_key)
        return True


CARDPOINTE_RESPCODE_MESSAGES: dict[str, str] = {
    # Common decline / error codes — maps to user-readable messages.
    "100": "Approved",
    "101": "Card declined",
    "102": "Call your bank",
    "103": "Insufficient funds",
    "104": "Card expired",
    "105": "Suspected fraud",
    "106": "Stolen card",
    "107": "Lost card",
    "108": "Card not supported",
    "109": "Restricted card",
    "111": "Invalid CVV",
    "112": "Invalid card number",
    "113": "Invalid expiration date",
    "114": "Issuer unavailable",
    "115": "Duplicate transaction",
    "116": "Transaction limit exceeded",
    "117": "Processor error",
    "118": "Communication error",
    "201": "Authorization failed",
    "202": "Capture failed",
    "203": "Refund failed",
}


def _cardpointe_failure_reason(data: dict[str, Any]) -> str:
    respcode = str(data.get("respcode") or "")
    if respcode and respcode in CARDPOINTE_RESPCODE_MESSAGES:
        mapped = CARDPOINTE_RESPCODE_MESSAGES[respcode]
        resptext = data.get("resptext") or ""
        if resptext and resptext.lower() != mapped.lower():
            return f"{mapped} ({resptext})"
        return mapped
    return str(data.get("resptext") or data.get("message") or "CardPointe charge failed")


class CardPointePaymentProvider:
    provider = "cardpointe"

    def __init__(self, setting: OwnerPaymentSetting):
        self.setting = setting
        self.merchant_id = setting.cardpointe_merchant_id
        self.username = decrypt_secret(setting.cardpointe_username_encrypted)
        self.password = decrypt_secret(setting.cardpointe_password_encrypted)
        self.site = (setting.cardpointe_site or "").rstrip("/")
        if not self.merchant_id or not self.username or not self.password or not self.site:
            raise PaymentProviderError("CardPointe credentials are incomplete")

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.site}/cardconnect/rest/{path.lstrip('/')}"
        with httpx.Client(timeout=20.0, auth=(self.username, self.password)) as client:
            response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, dict) else {"response": data}

    def _get(self, path: str) -> dict[str, Any]:
        url = f"{self.site}/cardconnect/rest/{path.lstrip('/')}"
        with httpx.Client(timeout=20.0, auth=(self.username, self.password)) as client:
            response = client.get(url)
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, dict) else {"response": data}

    def create_customer(self, user: User) -> str | None:
        return None

    def create_setup_session(self, user: User, provider_customer_id: str | None = None) -> SetupSessionResult:
        return SetupSessionResult(
            provider=self.provider,
            tokenizer_url=self.setting.cardpointe_tokenizer_url,
        )

    def save_payment_method(self, payload: dict[str, Any]) -> SavedPaymentMethodResult:
        token = payload.get("card_token")
        if not token:
            raise PaymentProviderError("CardPointe token is required")
        return SavedPaymentMethodResult(
            provider_customer_id=None,
            provider_payment_method_id=None,
            card_token=token,
            last4=payload.get("last4"),
            brand=payload.get("brand") or "card",
            exp_month=payload.get("exp_month"),
            exp_year=payload.get("exp_year"),
        )

    def charge_saved_method(
        self,
        *,
        payment_method: MemberOwnerPaymentMethod,
        amount_cents: int,
        currency: str,
        idempotency_key: str,
        metadata: dict[str, str] | None = None,
    ) -> ChargeResult:
        if not payment_method.card_token:
            raise PaymentProviderError("CardPointe token is required")
        payload = {
            "merchid": self.merchant_id,
            "account": payment_method.card_token,
            "amount": f"{amount_cents / 100:.2f}",
            "currency": currency.upper(),
            "capture": "Y",
            "orderid": idempotency_key[:50],
        }
        data = self._post("auth", payload)
        approved = str(data.get("respstat", "")).upper() == "A"
        if approved:
            return ChargeResult(
                status="succeeded",
                provider_payment_id=str(data.get("retref") or data.get("authcode") or ""),
                provider_reference_id=str(data.get("retref") or ""),
                raw_response=data,
            )
        return ChargeResult(
            status="failed",
            provider_reference_id=str(data.get("retref") or "") or None,
            raw_response=data,
            failure_reason=_cardpointe_failure_reason(data),
        )

    def void_or_refund(self, *, provider_payment_id: str | None, provider_reference_id: str | None, amount_cents: int | None = None) -> ChargeResult:
        retref = provider_reference_id or provider_payment_id
        if not retref:
            raise PaymentProviderError("CardPointe retref is required")
        payload: dict[str, Any] = {"merchid": self.merchant_id, "retref": retref}
        data = self._post("void", payload)
        if str(data.get("respstat", "")).upper() == "A":
            return ChargeResult(status="voided", provider_reference_id=retref, raw_response=data)
        payload = {"merchid": self.merchant_id, "retref": retref}
        if amount_cents is not None:
            payload["amount"] = f"{amount_cents / 100:.2f}"
        data = self._post("refund", payload)
        approved = str(data.get("respstat", "")).upper() == "A"
        return ChargeResult(
            status="refunded" if approved else "failed",
            provider_reference_id=retref,
            raw_response=data,
            failure_reason=None if approved else _cardpointe_failure_reason(data),
        )

    def get_payment_status(self, provider_payment_id: str) -> ChargeResult:
        data = self._get(f"inquire/{provider_payment_id}/{self.merchant_id}")
        return ChargeResult(status=str(data.get("setlstat") or data.get("respstat") or "unknown"), provider_reference_id=provider_payment_id, raw_response=data)

    def test_connection(self) -> bool:
        self._get(f"profile/{self.merchant_id}")
        return True


class PaymentProviderFactory:
    @staticmethod
    def get(setting: OwnerPaymentSetting) -> PaymentProvider:
        provider = setting.provider.lower()
        if provider == "stripe":
            return StripePaymentProvider(setting)
        if provider == "cardpointe":
            return CardPointePaymentProvider(setting)
        raise PaymentProviderError("Unsupported payment provider")
