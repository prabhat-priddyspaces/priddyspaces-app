from pydantic import BaseModel, ConfigDict

from app.models.enums import BillingCycle, SpaceType


class SubscriptionPlanCreate(BaseModel):
    name: str
    space_type: SpaceType
    billing_cycle: BillingCycle
    price: int
    stripe_price_id: str | None = None
    is_active: bool = True


class SubscriptionPlanUpdate(BaseModel):
    name: str | None = None
    price: int | None = None
    stripe_price_id: str | None = None
    is_active: bool | None = None


class SubscriptionPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    name: str
    organization_id: int
    tenant_id: int
    space_type: SpaceType
    billing_cycle: BillingCycle
    price: int
    stripe_price_id: str | None
    is_active: bool


class SubscriptionPlanPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    name: str
    space_type: SpaceType
    billing_cycle: BillingCycle
    price: int
    is_active: bool
