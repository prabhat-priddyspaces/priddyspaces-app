from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.crypto import encrypt_secret
from app.db.deps import get_db
from app.models.booking_request import BookingRequest
from app.models.customer_owner_payment_method import CustomerOwnerPaymentMethod
from app.models.enums import BookingRequestStatus, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.space import Space
from app.schemas.owner_payment import (
    CustomerOwnerPaymentMethodCreate,
    CustomerOwnerPaymentMethodOut,
    OwnerPaymentSettingOut,
    OwnerPaymentSettingUpsert,
    PaymentMethodResolveOut,
    PaymentMethodSetupSessionCreate,
    PaymentMethodSetupSessionOut,
    PaymentProviderOverrideUpdate,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_location_roles, require_owner_or_admin
from app.services.notifications import send_email
from app.services.owner_payments import (
    count_open_requests_for_setting,
    get_default_payment_method,
    get_enabled_owner_payment_setting,
    normalize_provider,
    resolve_payment_provider,
    set_default_payment_method,
)
from app.services.payment_providers import PaymentProviderError, PaymentProviderFactory

router = APIRouter()


def _org_by_public_id(db: Session, public_id: str) -> Organization:
    org = db.query(Organization).filter(Organization.public_id == public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _serialize_setting(setting: OwnerPaymentSetting, org: Organization | None = None) -> OwnerPaymentSettingOut:
    return OwnerPaymentSettingOut(
        public_id=setting.public_id,
        organization_public_id=org.public_id if org else None,
        provider=setting.provider,
        is_enabled=setting.is_enabled,
        is_test_mode=setting.is_test_mode,
        stripe_publishable_key=setting.stripe_publishable_key,
        has_stripe_secret_key=bool(setting.stripe_secret_key_encrypted),
        has_stripe_webhook_secret=bool(setting.stripe_webhook_secret_encrypted),
        cardpointe_merchant_id=setting.cardpointe_merchant_id,
        has_cardpointe_username=bool(setting.cardpointe_username_encrypted),
        has_cardpointe_password=bool(setting.cardpointe_password_encrypted),
        cardpointe_site=setting.cardpointe_site,
        cardpointe_tokenizer_url=setting.cardpointe_tokenizer_url,
        connection_status=setting.connection_status,
        last_tested_at=setting.last_tested_at,
    )


def _serialize_method(
    method: CustomerOwnerPaymentMethod,
    organization: Organization | None = None,
    setting: OwnerPaymentSetting | None = None,
) -> CustomerOwnerPaymentMethodOut:
    return CustomerOwnerPaymentMethodOut(
        public_id=method.public_id,
        organization_public_id=organization.public_id if organization else None,
        provider=method.provider,
        owner_payment_setting_public_id=setting.public_id if setting else None,
        last4=method.last4,
        brand=method.brand,
        exp_month=method.exp_month,
        exp_year=method.exp_year,
        is_default_for_owner=method.is_default_for_owner,
        status=method.status,
        billing_name=method.billing_name,
        billing_zip=method.billing_zip,
        created_at=method.created_at,
    )


@router.get("/owner/payment-settings", response_model=list[OwnerPaymentSettingOut])
def list_owner_payment_settings(
    organization_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = _org_by_public_id(db, organization_public_id)
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    settings = (
        db.query(OwnerPaymentSetting)
        .filter(OwnerPaymentSetting.organization_id == org.id)
        .order_by(OwnerPaymentSetting.provider.asc())
        .all()
    )
    return [_serialize_setting(setting, org) for setting in settings]


@router.post("/owner/payment-settings", response_model=OwnerPaymentSettingOut)
def upsert_owner_payment_setting(
    organization_public_id: str,
    payload: OwnerPaymentSettingUpsert,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = _org_by_public_id(db, organization_public_id)
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    provider = normalize_provider(payload.provider)

    setting = (
        db.query(OwnerPaymentSetting)
        .filter(OwnerPaymentSetting.organization_id == org.id, OwnerPaymentSetting.provider == provider)
        .first()
    )
    if not setting:
        setting = OwnerPaymentSetting(organization_id=org.id, tenant_id=org.id, provider=provider)

    setting.is_enabled = payload.is_enabled
    setting.is_test_mode = payload.is_test_mode
    setting.stripe_publishable_key = payload.stripe_publishable_key.strip() if payload.stripe_publishable_key else None
    if payload.stripe_secret_key is not None:
        setting.stripe_secret_key_encrypted = encrypt_secret(payload.stripe_secret_key.strip() or None)
    if payload.stripe_webhook_secret is not None:
        setting.stripe_webhook_secret_encrypted = encrypt_secret(payload.stripe_webhook_secret.strip() or None)
    setting.cardpointe_merchant_id = payload.cardpointe_merchant_id.strip() if payload.cardpointe_merchant_id else None
    if payload.cardpointe_username is not None:
        setting.cardpointe_username_encrypted = encrypt_secret(payload.cardpointe_username.strip() or None)
    if payload.cardpointe_password is not None:
        setting.cardpointe_password_encrypted = encrypt_secret(payload.cardpointe_password.strip() or None)
    setting.cardpointe_site = payload.cardpointe_site.rstrip("/") if payload.cardpointe_site else None
    setting.cardpointe_tokenizer_url = payload.cardpointe_tokenizer_url.strip() if payload.cardpointe_tokenizer_url else None

    db.add(setting)
    db.commit()
    db.refresh(setting)
    return _serialize_setting(setting, org)


@router.post("/owner/payment-settings/{public_id}/test", response_model=OwnerPaymentSettingOut)
def test_owner_payment_setting(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    setting = db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.public_id == public_id).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Payment setting not found")
    org = db.query(Organization).filter(Organization.id == setting.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    try:
        provider = PaymentProviderFactory.get(setting)
        provider.test_connection()
        setting.connection_status = "connected"
    except Exception as exc:
        setting.connection_status = "failed"
        db.add(setting)
        db.commit()
        db.refresh(setting)
        raise HTTPException(status_code=400, detail=str(exc))
    setting.last_tested_at = datetime.now(timezone.utc)
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return _serialize_setting(setting, org)


@router.post("/owner/payment-settings/{public_id}/enable", response_model=OwnerPaymentSettingOut)
def enable_owner_payment_setting(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    setting = db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.public_id == public_id).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Payment setting not found")
    org = db.query(Organization).filter(Organization.id == setting.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    setting.is_enabled = True
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return _serialize_setting(setting, org)


@router.post("/owner/payment-settings/{public_id}/disable", response_model=OwnerPaymentSettingOut)
def disable_owner_payment_setting(
    public_id: str,
    force: bool = False,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    setting = db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.public_id == public_id).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Payment setting not found")
    org = db.query(Organization).filter(Organization.id == setting.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    if not force:
        open_count = count_open_requests_for_setting(db, setting.id)
        if open_count > 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot disable setting while {open_count} open booking request(s) "
                    f"reference it. Resolve them first or pass force=true."
                ),
            )
    setting.is_enabled = False
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return _serialize_setting(setting, org)


@router.patch("/owner/payment-provider/organization/{organization_public_id}")
def update_organization_payment_provider(
    organization_public_id: str,
    payload: PaymentProviderOverrideUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    org = _org_by_public_id(db, organization_public_id)
    user = get_or_create_user(db, token)
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)
    org.payment_provider = normalize_provider(payload.payment_provider) if payload.payment_provider else None
    db.add(org)
    db.commit()
    return {"payment_provider": org.payment_provider}


@router.patch("/owner/payment-provider/location/{location_public_id}")
def update_location_payment_provider(
    location_public_id: str,
    payload: PaymentProviderOverrideUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    location = db.query(Location).filter(Location.public_id == location_public_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    user = get_or_create_user(db, token)
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})
    location.payment_provider = normalize_provider(payload.payment_provider) if payload.payment_provider else None
    db.add(location)
    db.commit()
    return {"payment_provider": location.payment_provider}


@router.get("/payment-methods/resolve", response_model=PaymentMethodResolveOut)
def resolve_customer_payment_method(
    space_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role != UserAppRole.CUSTOMER:
        raise HTTPException(status_code=403, detail="Customer only")
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    provider, org, _location = resolve_payment_provider(db, space)
    setting = (
        db.query(OwnerPaymentSetting)
        .filter(
            OwnerPaymentSetting.organization_id == org.id,
            OwnerPaymentSetting.provider == provider,
            OwnerPaymentSetting.is_enabled.is_(True),
        )
        .first()
    )
    if not setting:
        return PaymentMethodResolveOut(
            provider=provider,
            organization_public_id=org.public_id,
            is_configured=False,
            has_payment_method=False,
            message="Owner payment provider is not configured",
        )
    method = get_default_payment_method(db, user.id, org.id, provider, setting.id)
    return PaymentMethodResolveOut(
        provider=provider,
        owner_payment_setting_public_id=setting.public_id,
        organization_public_id=org.public_id,
        is_configured=True,
        has_payment_method=method is not None,
        payment_method_public_id=method.public_id if method else None,
        publishable_key=setting.stripe_publishable_key if provider == "stripe" else None,
        tokenizer_url=setting.cardpointe_tokenizer_url if provider == "cardpointe" else None,
    )


@router.post("/payment-methods/setup-session", response_model=PaymentMethodSetupSessionOut)
def create_payment_method_setup_session(
    payload: PaymentMethodSetupSessionCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    provider_name, org, _location = resolve_payment_provider(db, space)
    setting = get_enabled_owner_payment_setting(db, org.id, provider_name)
    existing_method = get_default_payment_method(db, user.id, org.id, provider_name, setting.id)
    try:
        provider = PaymentProviderFactory.get(setting)
        session = provider.create_setup_session(
            user,
            provider_customer_id=existing_method.provider_customer_id if existing_method else None,
        )
    except PaymentProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PaymentMethodSetupSessionOut(
        provider=session.provider,
        owner_payment_setting_public_id=setting.public_id,
        provider_customer_id=session.provider_customer_id,
        client_secret=session.client_secret,
        setup_intent_id=session.setup_intent_id,
        publishable_key=session.publishable_key,
        tokenizer_url=session.tokenizer_url,
    )


@router.post("/payment-methods", response_model=CustomerOwnerPaymentMethodOut)
def save_customer_payment_method(
    payload: CustomerOwnerPaymentMethodCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role != UserAppRole.CUSTOMER:
        raise HTTPException(status_code=403, detail="Customer only")
    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    provider_name, org, _location = resolve_payment_provider(db, space)
    setting = get_enabled_owner_payment_setting(db, org.id, provider_name)
    if payload.owner_payment_setting_public_id and payload.owner_payment_setting_public_id != setting.public_id:
        raise HTTPException(status_code=400, detail="Payment setting changed; refresh and try again")

    provider = PaymentProviderFactory.get(setting)
    try:
        saved = provider.save_payment_method(payload.model_dump())
    except PaymentProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    method = CustomerOwnerPaymentMethod(
        user_id=user.id,
        organization_id=org.id,
        tenant_id=org.id,
        provider=provider_name,
        owner_payment_setting_id=setting.id,
        provider_customer_id=saved.provider_customer_id,
        provider_payment_method_id=saved.provider_payment_method_id,
        card_token=saved.card_token,
        last4=saved.last4,
        brand=saved.brand,
        exp_month=saved.exp_month,
        exp_year=saved.exp_year,
        status="active",
        billing_name=payload.billing_name,
        billing_zip=payload.billing_zip,
    )
    set_default_payment_method(db, method)
    db.add(method)
    db.commit()
    db.refresh(method)
    send_email(user.email, "Card saved", "Your payment method was saved for this owner.")
    return _serialize_method(method, org, setting)


@router.get("/payment-methods", response_model=list[CustomerOwnerPaymentMethodOut])
def list_customer_payment_methods(
    organization_public_id: str | None = None,
    space_public_id: str | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    query = db.query(CustomerOwnerPaymentMethod).filter(CustomerOwnerPaymentMethod.user_id == user.id)
    if not include_inactive:
        query = query.filter(CustomerOwnerPaymentMethod.status == "active")
    org: Organization | None = None
    if space_public_id:
        space = db.query(Space).filter(Space.public_id == space_public_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        _provider, org, _location = resolve_payment_provider(db, space)
        query = query.filter(CustomerOwnerPaymentMethod.organization_id == org.id)
    elif organization_public_id:
        org = _org_by_public_id(db, organization_public_id)
        query = query.filter(CustomerOwnerPaymentMethod.organization_id == org.id)

    methods = query.order_by(CustomerOwnerPaymentMethod.created_at.desc()).all()
    setting_ids = {method.owner_payment_setting_id for method in methods}
    settings_by_id = {
        setting.id: setting
        for setting in db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.id.in_(setting_ids)).all()
    } if setting_ids else {}
    org_ids = {method.organization_id for method in methods}
    orgs_by_id = {
        organization.id: organization
        for organization in db.query(Organization).filter(Organization.id.in_(org_ids)).all()
    } if org_ids else {}
    return [
        _serialize_method(method, orgs_by_id.get(method.organization_id), settings_by_id.get(method.owner_payment_setting_id))
        for method in methods
    ]


@router.delete("/payment-methods/{public_id}", response_model=CustomerOwnerPaymentMethodOut)
def delete_customer_payment_method(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    method = (
        db.query(CustomerOwnerPaymentMethod)
        .filter(CustomerOwnerPaymentMethod.public_id == public_id, CustomerOwnerPaymentMethod.user_id == user.id)
        .first()
    )
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    active_request = (
        db.query(BookingRequest)
        .filter(
            BookingRequest.customer_owner_payment_method_id == method.id,
            BookingRequest.status.in_([BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED]),
        )
        .first()
    )
    if active_request:
        raise HTTPException(status_code=400, detail="Payment method is attached to an active request")
    method.status = "deleted"
    db.add(method)
    db.commit()
    db.refresh(method)
    org = db.query(Organization).filter(Organization.id == method.organization_id).first()
    setting = db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.id == method.owner_payment_setting_id).first()
    return _serialize_method(method, org, setting)


@router.post("/payment-methods/{public_id}/default", response_model=CustomerOwnerPaymentMethodOut)
def make_customer_payment_method_default(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    method = (
        db.query(CustomerOwnerPaymentMethod)
        .filter(
            CustomerOwnerPaymentMethod.public_id == public_id,
            CustomerOwnerPaymentMethod.user_id == user.id,
            CustomerOwnerPaymentMethod.status == "active",
        )
        .first()
    )
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    set_default_payment_method(db, method)
    db.commit()
    db.refresh(method)
    org = db.query(Organization).filter(Organization.id == method.organization_id).first()
    setting = db.query(OwnerPaymentSetting).filter(OwnerPaymentSetting.id == method.owner_payment_setting_id).first()
    return _serialize_method(method, org, setting)
