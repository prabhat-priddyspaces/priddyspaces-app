from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PricingRuleCreate(BaseModel):
    space_public_id: str
    rate_type: str  # hourly | daily
    rate_amount: int
    active_from: datetime | None = None
    active_to: datetime | None = None


class PricingRuleOut(BaseModel):
    public_id: str
    space_id: int
    rate_type: str
    rate_amount: int
    active_from: datetime | None
    active_to: datetime | None

    model_config = ConfigDict(from_attributes=True)


class PromoCodeCreate(BaseModel):
    code: str
    discount_type: str  # percent | fixed
    discount_value: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True


class PromoCodeOut(BaseModel):
    public_id: str
    code: str
    discount_type: str
    discount_value: int
    starts_at: datetime | None
    ends_at: datetime | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class TaxConfigIn(BaseModel):
    rate_percent: float


class TaxConfigOut(BaseModel):
    public_id: str
    rate_percent: float

    model_config = ConfigDict(from_attributes=True)
