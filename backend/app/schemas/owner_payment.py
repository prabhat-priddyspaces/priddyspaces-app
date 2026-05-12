from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OwnerPaymentSettingUpsert(BaseModel):
    provider: str
    is_enabled: bool = False
    is_test_mode: bool = True
    stripe_publishable_key: str | None = None
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    cardpointe_merchant_id: str | None = None
    cardpointe_username: str | None = None
    cardpointe_password: str | None = None
    cardpointe_site: str | None = None
    cardpointe_tokenizer_url: str | None = None
    force: bool = False


class OwnerPaymentSettingOut(BaseModel):
    public_id: str
    organization_public_id: str | None = None
    provider: str
    is_enabled: bool
    is_test_mode: bool
    stripe_publishable_key: str | None = None
    has_stripe_secret_key: bool = False
    has_stripe_webhook_secret: bool = False
    cardpointe_merchant_id: str | None = None
    has_cardpointe_username: bool = False
    has_cardpointe_password: bool = False
    cardpointe_site: str | None = None
    cardpointe_tokenizer_url: str | None = None
    connection_status: str
    last_tested_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PaymentProviderOverrideUpdate(BaseModel):
    payment_provider: str | None = None


class PaymentMethodResolveOut(BaseModel):
    provider: str
    owner_payment_setting_public_id: str | None = None
    organization_public_id: str | None = None
    is_configured: bool
    has_payment_method: bool
    payment_method_public_id: str | None = None
    publishable_key: str | None = None
    tokenizer_url: str | None = None
    message: str | None = None


class PaymentMethodSetupSessionCreate(BaseModel):
    space_public_id: str


class PaymentMethodSetupSessionOut(BaseModel):
    provider: str
    owner_payment_setting_public_id: str
    provider_customer_id: str | None = None
    client_secret: str | None = None
    setup_intent_id: str | None = None
    publishable_key: str | None = None
    tokenizer_url: str | None = None


class MemberOwnerPaymentMethodCreate(BaseModel):
    space_public_id: str
    owner_payment_setting_public_id: str | None = None
    provider_customer_id: str | None = None
    setup_intent_id: str | None = None
    provider_payment_method_id: str | None = None
    card_token: str | None = None
    last4: str | None = None
    brand: str | None = None
    exp_month: int | None = None
    exp_year: int | None = None
    billing_name: str | None = None
    billing_zip: str | None = None


class MemberOwnerPaymentMethodOut(BaseModel):
    public_id: str
    organization_public_id: str | None = None
    provider: str
    owner_payment_setting_public_id: str | None = None
    last4: str | None = None
    brand: str | None = None
    exp_month: int | None = None
    exp_year: int | None = None
    is_default_for_owner: bool
    status: str
    billing_name: str | None = None
    billing_zip: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
