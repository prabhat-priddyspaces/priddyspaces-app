from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

import httpx
import stripe

from app.core.crypto import decrypt_secret
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.user import User
from app.services.payment_metadata import (
    last4_from_card_token,
    normalize_card_last4,
    normalize_cardpointe_tokenizer_url,
    normalize_expiry,
    normalize_payment_failure_reason,
)


class PaymentProviderError(RuntimeError):
    pass


INCOMPLETE_CARD_DETAILS = "Card details are incomplete. Please add the card again."


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


def _stripe_get(value: Any, key: str, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def stripe_object_to_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return {
            str(key): stripe_object_to_dict(item) if _is_stripe_object_like(item) else _stripe_value_to_plain(item)
            for key, item in value.items()
        }
    for method_name in ("to_dict_recursive", "to_dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            data = method()
            if isinstance(data, dict):
                return stripe_object_to_dict(data)
    data = getattr(value, "_data", None)
    if isinstance(data, dict):
        return stripe_object_to_dict(data)
    items = getattr(value, "items", None)
    if callable(items):
        try:
            return stripe_object_to_dict(dict(items()))
        except Exception:
            return {}
    return {}


def _is_stripe_object_like(value: Any) -> bool:
    if isinstance(value, dict):
        return True
    return any(callable(getattr(value, method_name, None)) for method_name in ("to_dict_recursive", "to_dict")) or isinstance(getattr(value, "_data", None), dict)


def _stripe_value_to_plain(value: Any) -> Any:
    if isinstance(value, list):
        return [stripe_object_to_dict(item) if _is_stripe_object_like(item) else _stripe_value_to_plain(item) for item in value]
    if isinstance(value, tuple):
        return [_stripe_value_to_plain(item) for item in value]
    if _is_stripe_object_like(value):
        return stripe_object_to_dict(value)
    return value


def _stripe_card_details(method: Any) -> dict[str, Any]:
    card = _stripe_get(method, "card", {}) or {}
    billing_details = _stripe_get(method, "billing_details", {}) or {}
    address = _stripe_get(billing_details, "address", {}) or {}
    return {
        "provider_payment_method_id": _stripe_get(method, "id"),
        "provider_customer_id": _stripe_get(method, "customer"),
        "last4": _stripe_get(card, "last4"),
        "brand": _stripe_get(card, "brand"),
        "exp_month": _stripe_get(card, "exp_month"),
        "exp_year": _stripe_get(card, "exp_year"),
        "billing_name": _stripe_get(billing_details, "name"),
        "billing_zip": _stripe_get(address, "postal_code"),
    }


def _stripe_failure_reason_from_error(exc: stripe.error.StripeError) -> str:
    error = getattr(exc, "json_body", None) or {}
    error_body = error.get("error", {}) if isinstance(error, dict) else {}
    message = (
        getattr(exc, "user_message", None)
        or error_body.get("message")
        or getattr(exc, "message", None)
        or str(exc)
    )
    code = error_body.get("decline_code") or error_body.get("code") or getattr(exc, "code", None)
    if message and code and str(code).lower() not in str(message).lower():
        message = f"{message} ({code})"
    return normalize_payment_failure_reason(message)


def _stripe_failure_reason_from_intent(intent: Any) -> str:
    last_error = _stripe_get(intent, "last_payment_error")
    message = _stripe_get(last_error, "message")
    code = _stripe_get(last_error, "decline_code") or _stripe_get(last_error, "code")
    if message and code and str(code).lower() not in str(message).lower():
        message = f"{message} ({code})"
    if message:
        return normalize_payment_failure_reason(message)
    status = _stripe_get(intent, "status")
    if status == "requires_action":
        return "This card requires additional authentication before it can be charged."
    return normalize_payment_failure_reason(f"Stripe status {status}" if status else None)


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

        if setup_intent_id:
            setup_intent = stripe.SetupIntent.retrieve(setup_intent_id, api_key=self.secret_key)
            payment_method_id = _stripe_get(setup_intent, "payment_method") or payment_method_id
            customer_id = _stripe_get(setup_intent, "customer") or customer_id
        if not payment_method_id:
            raise PaymentProviderError(INCOMPLETE_CARD_DETAILS)

        method = stripe.PaymentMethod.retrieve(payment_method_id, api_key=self.secret_key)
        details = _stripe_card_details(method)
        customer_id = details.get("provider_customer_id") or customer_id
        last4 = normalize_card_last4(details.get("last4"))
        exp_month, exp_year = normalize_expiry(details.get("exp_month"), details.get("exp_year"))
        brand = details.get("brand")
        if not customer_id or not last4 or not brand or not exp_month or not exp_year:
            raise PaymentProviderError(INCOMPLETE_CARD_DETAILS)
        return SavedPaymentMethodResult(
            provider_customer_id=customer_id,
            provider_payment_method_id=payment_method_id,
            card_token=None,
            last4=last4,
            brand=brand,
            exp_month=exp_month,
            exp_year=exp_year,
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
            failure_reason = _stripe_failure_reason_from_error(exc)
            return ChargeResult(status="failed", failure_reason=failure_reason, raw_response={"error": str(exc)})
        raw = stripe_object_to_dict(intent)
        intent_status = raw.get("status") or _stripe_get(intent, "status")
        intent_id = raw.get("id") or _stripe_get(intent, "id")
        if intent_status == "succeeded":
            return ChargeResult(status="succeeded", provider_payment_id=intent_id, raw_response=raw)
        return ChargeResult(
            status="failed",
            provider_payment_id=intent_id,
            raw_response=raw,
            failure_reason=_stripe_failure_reason_from_intent(intent),
        )

    def void_or_refund(self, *, provider_payment_id: str | None, provider_reference_id: str | None, amount_cents: int | None = None) -> ChargeResult:
        if not provider_payment_id:
            raise PaymentProviderError("Stripe payment id is required for refund")
        kwargs: dict[str, Any] = {"payment_intent": provider_payment_id, "api_key": self.secret_key}
        if amount_cents is not None:
            kwargs["amount"] = amount_cents
        refund = stripe.Refund.create(**kwargs)
        raw = stripe_object_to_dict(refund)
        return ChargeResult(status="refunded", provider_payment_id=provider_payment_id, provider_reference_id=raw.get("id") or _stripe_get(refund, "id"), raw_response=raw)

    def get_payment_status(self, provider_payment_id: str) -> ChargeResult:
        intent = stripe.PaymentIntent.retrieve(provider_payment_id, api_key=self.secret_key)
        raw = stripe_object_to_dict(intent)
        return ChargeResult(status=raw.get("status") or _stripe_get(intent, "status"), provider_payment_id=raw.get("id") or _stripe_get(intent, "id"), raw_response=raw)

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
        if resptext and resptext.lower() != mapped.lower() and str(resptext).strip() != "0":
            return normalize_payment_failure_reason(f"{mapped} ({resptext})")
        return mapped
    return normalize_payment_failure_reason(data.get("resptext") or data.get("message"))


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
            tokenizer_url=normalize_cardpointe_tokenizer_url(self.setting.cardpointe_tokenizer_url),
        )

    def save_payment_method(self, payload: dict[str, Any]) -> SavedPaymentMethodResult:
        token = payload.get("card_token")
        if not token:
            raise PaymentProviderError("CardPointe token is required")
        last4 = normalize_card_last4(payload.get("last4")) or last4_from_card_token(token)
        exp_month, exp_year = normalize_expiry(
            payload.get("exp_month"),
            payload.get("exp_year"),
            expiration=payload.get("expiration") or payload.get("expiry"),
        )
        if not last4 or not exp_month or not exp_year:
            raise PaymentProviderError(INCOMPLETE_CARD_DETAILS)
        return SavedPaymentMethodResult(
            provider_customer_id=None,
            provider_payment_method_id=None,
            card_token=token,
            last4=last4,
            brand=payload.get("brand") or "card",
            exp_month=exp_month,
            exp_year=exp_year,
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
