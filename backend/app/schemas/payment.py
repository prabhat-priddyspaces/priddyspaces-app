from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PaymentIntentCreate(BaseModel):
    amount: int | None = None
    currency: str = "usd"
    booking_public_id: str | None = None


class PaymentIntentOut(BaseModel):
    client_secret: str
    payment_intent_id: str


class SubscriptionPurchase(BaseModel):
    space_public_id: str
    stripe_price_id: str | None = None
    subscription_plan_public_id: str | None = None


class SubscriptionPurchaseOut(BaseModel):
    stripe_subscription_id: str
    client_secret: str | None


class MemberPortalOut(BaseModel):
    url: str


class PaymentOut(BaseModel):
    id: int
    public_id: str
    amount: int
    provider: str
    status: str
    tenant_id: int | None
    member_public_id: str | None = None
    member_name: str | None = None
    member_email: str | None = None
    booking_id: int | None
    booking_public_id: str | None = None
    booking_request_public_id: str | None = None
    booking_start_datetime: datetime | None = None
    booking_end_datetime: datetime | None = None
    booking_request_id: int | None = None
    subscription_id: int | None
    subscription_public_id: str | None = None
    subscription_start_date: str | None = None
    subscription_end_date: str | None = None
    space_public_id: str | None = None
    space_name: str | None = None
    space_type: str | None = None
    location_public_id: str | None = None
    location_name: str | None = None
    location_city: str | None = None
    organization_public_id: str | None = None
    organization_name: str | None = None
    payment_method_id: int | None = None
    payment_method_public_id: str | None = None
    payment_method_brand: str | None = None
    payment_method_last4: str | None = None
    payment_method_exp_month: int | None = None
    payment_method_exp_year: int | None = None
    amount_cents: int | None = None
    subtotal_cents: int | None = None
    discount_cents: int | None = None
    tax_cents: int | None = None
    refunded_amount_cents: int | None = None
    currency: str | None = None
    provider_payment_id: str | None = None
    provider_reference_id: str | None = None
    failure_reason: str | None = None
    commission_rate_pct: int | None
    platform_fee_amount: int | None
    owner_net_amount: int | None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class OwnerPayoutSummaryOut(BaseModel):
    gross_cents: int
    tax_cents: int
    refunded_cents: int
    platform_fee_cents: int
    owner_net_cents: int
    succeeded_count: int
    failed_count: int
