from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.booking_request import BookingRequest
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.enums import BookingRequestStatus
from app.models.location import Location
from app.models.organization import Organization
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.models.user import User

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
