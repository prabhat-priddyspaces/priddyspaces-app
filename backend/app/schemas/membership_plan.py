from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BillingCycle, BookingMode


class MembershipPlanCreate(BaseModel):
    space_public_id: str
    booking_mode: BookingMode
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    price_cents: int = Field(ge=0)
    billing_cycle: BillingCycle = BillingCycle.MONTHLY
    commitment_months: int | None = Field(default=None, ge=1)
    auto_renew: bool = False
    included_meeting_room_hours_per_month: int = Field(default=0, ge=0)
    overage_hourly_rate_cents: int | None = Field(default=None, ge=0)
    seats_per_plan: int = Field(default=1, ge=1)
    max_active_subscriptions: int | None = Field(default=None, ge=1)
    is_active: bool = True
    sort_order: int = 0


class MembershipPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    price_cents: int | None = Field(default=None, ge=0)
    billing_cycle: BillingCycle | None = None
    commitment_months: int | None = Field(default=None, ge=1)
    auto_renew: bool | None = None
    included_meeting_room_hours_per_month: int | None = Field(default=None, ge=0)
    overage_hourly_rate_cents: int | None = Field(default=None, ge=0)
    seats_per_plan: int | None = Field(default=None, ge=1)
    max_active_subscriptions: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    sort_order: int | None = None


class MembershipPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    space_id: int
    booking_mode: BookingMode
    name: str
    description: str | None
    price_cents: int
    billing_cycle: BillingCycle
    stripe_price_id: str | None
    commitment_months: int | None
    auto_renew: bool
    included_meeting_room_hours_per_month: int
    overage_hourly_rate_cents: int | None
    seats_per_plan: int
    max_active_subscriptions: int | None
    is_active: bool
    sort_order: int


class MembershipPlanPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    booking_mode: BookingMode
    name: str
    description: str | None
    price_cents: int
    billing_cycle: BillingCycle
    commitment_months: int | None
    included_meeting_room_hours_per_month: int
    overage_hourly_rate_cents: int | None
    seats_per_plan: int
