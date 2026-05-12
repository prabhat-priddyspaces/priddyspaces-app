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
    booking_id: int | None
    booking_request_id: int | None = None
    subscription_id: int | None
    payment_method_id: int | None = None
    amount_cents: int | None = None
    currency: str | None = None
    provider_payment_id: str | None = None
    provider_reference_id: str | None = None
    failure_reason: str | None = None
    commission_rate_pct: int | None
    platform_fee_amount: int | None
    owner_net_amount: int | None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
