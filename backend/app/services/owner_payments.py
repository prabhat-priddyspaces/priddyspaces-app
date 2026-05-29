from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
import stripe
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.models.booking_request import BookingRequest
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import BookingRequestStatus
from app.models.location import Location
from app.models.organization import Organization
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.models.user import User
from app.services.stripe_payments import create_customer as create_platform_stripe_customer

logger = logging.getLogger(__name__)

OPEN_BOOKING_STATUSES = {
    BookingRequestStatus.REQUESTED,
    BookingRequestStatus.APPROVED,
    BookingRequestStatus.PAYMENT_FAILED,
}

SUPPORTED_PAYMENT_PROVIDERS = {"stripe", "cardpointe"}


def normalize_provider(provider: str | None) -> str:
    normalized = (provider or settings.DEFAULT_PAYMENT_PROVIDER or "stripe").strip().lower()
    if normalized not in SUPPORTED_PAYMENT_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported payment provider")
    return normalized


def resolve_payment_provider(db: Session, space: Space) -> tuple[str, Organization, Location | None]:
    location = db.query(Location).filter(Location.id == space.location_id).first()
    organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    provider = normalize_provider(
        (location.payment_provider if location and location.payment_provider else None)
        or organization.payment_provider
        or settings.DEFAULT_PAYMENT_PROVIDER
    )
    return provider, organization, location


def get_enabled_owner_payment_setting(
    db: Session,
    organization_id: int,
    provider: str,
) -> OwnerPaymentSetting:
    setting = (
        db.query(OwnerPaymentSetting)
        .filter(
            OwnerPaymentSetting.organization_id == organization_id,
            OwnerPaymentSetting.provider == provider,
            OwnerPaymentSetting.is_enabled.is_(True),
        )
        .first()
    )
    if not setting:
        raise HTTPException(status_code=400, detail="Owner payment provider is not configured")
    return setting


def get_default_payment_method(
    db: Session,
    user_id: int,
    organization_id: int,
    provider: str,
    owner_payment_setting_id: int,
) -> MemberOwnerPaymentMethod | None:
    return (
        db.query(MemberOwnerPaymentMethod)
        .filter(
            MemberOwnerPaymentMethod.user_id == user_id,
            MemberOwnerPaymentMethod.organization_id == organization_id,
            MemberOwnerPaymentMethod.provider == provider,
            MemberOwnerPaymentMethod.owner_payment_setting_id == owner_payment_setting_id,
            MemberOwnerPaymentMethod.status == "active",
        )
        .order_by(MemberOwnerPaymentMethod.is_default_for_owner.desc(), MemberOwnerPaymentMethod.created_at.desc())
        .first()
    )


def _stripe_get(value: Any, key: str, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _stripe_account_id(secret_key: str | None) -> str | None:
    if not secret_key:
        return None
    try:
        account = stripe.Account.retrieve(api_key=secret_key)
    except Exception as exc:  # noqa: BLE001 - provider reachability should not break checkout.
        logger.warning("Unable to resolve Stripe account for card reuse: %s", exc)
        return None
    return _stripe_get(account, "id")


def stripe_setting_matches_platform(setting: OwnerPaymentSetting) -> bool:
    if setting.provider != "stripe" or not settings.STRIPE_SECRET_KEY:
        return False
    owner_secret = decrypt_secret(setting.stripe_secret_key_encrypted)
    if not owner_secret:
        return False
    if owner_secret == settings.STRIPE_SECRET_KEY:
        return True
    platform_account_id = _stripe_account_id(settings.STRIPE_SECRET_KEY)
    owner_account_id = _stripe_account_id(owner_secret)
    return bool(platform_account_id and owner_account_id and platform_account_id == owner_account_id)


def ensure_platform_stripe_customer(db: Session, user: User) -> str | None:
    if user.stripe_customer_id:
        return user.stripe_customer_id
    if not settings.STRIPE_SECRET_KEY:
        return None
    customer = create_platform_stripe_customer(email=user.email)
    user.stripe_customer_id = customer.id
    db.add(user)
    db.commit()
    db.refresh(user)
    return user.stripe_customer_id


def _card_details(method: Any) -> dict[str, Any]:
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


def platform_default_stripe_payment_method(customer_id: str) -> dict[str, Any] | None:
    if not settings.STRIPE_SECRET_KEY or not customer_id:
        return None
    try:
        customer = stripe.Customer.retrieve(
            customer_id,
            api_key=settings.STRIPE_SECRET_KEY,
            expand=["invoice_settings.default_payment_method"],
        )
        invoice_settings = _stripe_get(customer, "invoice_settings", {}) or {}
        default_method = _stripe_get(invoice_settings, "default_payment_method")
        if isinstance(default_method, str):
            default_method = stripe.PaymentMethod.retrieve(default_method, api_key=settings.STRIPE_SECRET_KEY)
        if default_method:
            return _card_details(default_method)

        methods = stripe.PaymentMethod.list(
            customer=customer_id,
            type="card",
            limit=1,
            api_key=settings.STRIPE_SECRET_KEY,
        )
        data = _stripe_get(methods, "data", []) or []
        if data:
            return _card_details(data[0])
    except Exception as exc:  # noqa: BLE001 - importing a portal card is best-effort.
        logger.warning("Unable to inspect platform Stripe customer for card reuse: %s", exc)
    return None


def import_platform_payment_method_for_owner(
    db: Session,
    *,
    user: User,
    organization: Organization,
    setting: OwnerPaymentSetting,
) -> MemberOwnerPaymentMethod | None:
    if setting.provider != "stripe" or not user.stripe_customer_id:
        return None
    if not stripe_setting_matches_platform(setting):
        return None
    card = platform_default_stripe_payment_method(user.stripe_customer_id)
    payment_method_id = card.get("provider_payment_method_id") if card else None
    if not payment_method_id:
        return None

    existing = (
        db.query(MemberOwnerPaymentMethod)
        .filter(
            MemberOwnerPaymentMethod.user_id == user.id,
            MemberOwnerPaymentMethod.organization_id == organization.id,
            MemberOwnerPaymentMethod.provider == "stripe",
            MemberOwnerPaymentMethod.owner_payment_setting_id == setting.id,
            MemberOwnerPaymentMethod.provider_payment_method_id == payment_method_id,
            MemberOwnerPaymentMethod.status == "active",
        )
        .first()
    )
    if existing:
        set_default_payment_method(db, existing)
        return existing

    method = MemberOwnerPaymentMethod(
        user_id=user.id,
        organization_id=organization.id,
        tenant_id=organization.id,
        provider="stripe",
        owner_payment_setting_id=setting.id,
        provider_customer_id=card.get("provider_customer_id") or user.stripe_customer_id,
        provider_payment_method_id=payment_method_id,
        last4=card.get("last4"),
        brand=card.get("brand"),
        exp_month=card.get("exp_month"),
        exp_year=card.get("exp_year"),
        billing_name=card.get("billing_name"),
        billing_zip=card.get("billing_zip"),
        status="active",
    )
    set_default_payment_method(db, method)
    db.add(method)
    db.flush()
    return method


def require_payment_method_for_request(
    db: Session,
    user: User,
    space: Space,
    payment_method_public_id: str | None,
    consent: bool,
) -> tuple[OwnerPaymentSetting | None, MemberOwnerPaymentMethod | None, datetime | None]:
    provider, organization, _location = resolve_payment_provider(db, space)
    setting = get_enabled_owner_payment_setting(db, organization.id, provider)

    if not settings.PAYMENT_METHOD_REQUIRED_FOR_REQUEST:
        return setting, None, datetime.now(timezone.utc) if consent else None

    if not consent:
        raise HTTPException(status_code=400, detail="Payment authorization consent is required")

    query = db.query(MemberOwnerPaymentMethod).filter(
        MemberOwnerPaymentMethod.user_id == user.id,
        MemberOwnerPaymentMethod.organization_id == organization.id,
        MemberOwnerPaymentMethod.provider == provider,
        MemberOwnerPaymentMethod.owner_payment_setting_id == setting.id,
        MemberOwnerPaymentMethod.status == "active",
    )
    if payment_method_public_id:
        query = query.filter(MemberOwnerPaymentMethod.public_id == payment_method_public_id)
    method = query.order_by(
        MemberOwnerPaymentMethod.is_default_for_owner.desc(),
        MemberOwnerPaymentMethod.created_at.desc(),
    ).first()
    if not method:
        raise HTTPException(status_code=400, detail="Payment method is required before requesting this booking")
    return setting, method, datetime.now(timezone.utc)


def count_open_requests_for_setting(db: Session, setting_id: int) -> int:
    """Count booking_requests still tied to this owner_payment_setting in an open state."""
    return (
        db.query(BookingRequest)
        .filter(
            BookingRequest.owner_payment_setting_id == setting_id,
            BookingRequest.status.in_([s for s in OPEN_BOOKING_STATUSES]),
        )
        .count()
    )


def assert_safe_provider_change(
    db: Session,
    setting: OwnerPaymentSetting,
    new_provider: str,
    *,
    force: bool = False,
) -> None:
    """Block provider change when there are open requests on the existing setting.

    Existing requests freeze the provider via owner_payment_setting_id snapshot, so
    they will continue to charge against the OLD provider; but switching the
    OwnerPaymentSetting row mid-flight risks credential rot or operator confusion.
    Allow override via `force=True`.
    """
    if force:
        return
    if not setting.id or setting.provider == new_provider:
        return
    open_count = count_open_requests_for_setting(db, setting.id)
    if open_count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot switch provider while {open_count} open booking request(s) "
                f"are tied to the current setting. Resolve them first or pass force=true."
            ),
        )


def set_default_payment_method(db: Session, method: MemberOwnerPaymentMethod) -> None:
    db.query(MemberOwnerPaymentMethod).filter(
        MemberOwnerPaymentMethod.user_id == method.user_id,
        MemberOwnerPaymentMethod.organization_id == method.organization_id,
        MemberOwnerPaymentMethod.provider == method.provider,
        MemberOwnerPaymentMethod.owner_payment_setting_id == method.owner_payment_setting_id,
        MemberOwnerPaymentMethod.id != method.id,
    ).update({"is_default_for_owner": False})
    method.is_default_for_owner = True
    db.add(method)
