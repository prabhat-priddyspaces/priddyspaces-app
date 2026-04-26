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


class CustomerPortalOut(BaseModel):
    url: str


class PaymentOut(BaseModel):
    id: int
    public_id: str
    amount: int
    provider: str
    status: str
    tenant_id: int | None
    booking_id: int | None
    subscription_id: int | None
    commission_rate_pct: int | None
    platform_fee_amount: int | None
    owner_net_amount: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
