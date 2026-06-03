from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    code: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=1024)
    discount_type: str  # percent | fixed
    discount_value: int = Field(gt=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    expires_at: datetime | None = None
    max_redemptions: int | None = Field(default=None, ge=1)
    max_redemptions_per_member: int | None = Field(default=None, ge=1)
    is_active: bool = True

    @field_validator("discount_type")
    @classmethod
    def _validate_discount_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"percent", "fixed"}:
            raise ValueError("discount_type must be percent or fixed")
        return normalized

    @model_validator(mode="after")
    def _validate_discount_value(self):
        if self.discount_type == "percent" and not (1 <= self.discount_value <= 100):
            raise ValueError("Percentage discount must be between 1 and 100")
        return self


class PromoCodeOut(BaseModel):
    public_id: str
    code: str
    description: str | None = None
    discount_type: str
    discount_value: int
    starts_at: datetime | None
    ends_at: datetime | None
    expires_at: datetime | None = None
    max_redemptions: int | None = None
    max_redemptions_per_member: int | None = None
    total_redemptions: int = 0
    is_active: bool
    total_discount_granted_cents: int = 0
    revenue_impacted_cents: int = 0
    status: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TaxConfigIn(BaseModel):
    rate_percent: float


class TaxConfigOut(BaseModel):
    public_id: str
    rate_percent: float

    model_config = ConfigDict(from_attributes=True)
