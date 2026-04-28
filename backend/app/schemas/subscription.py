from datetime import date
from pydantic import BaseModel, ConfigDict


class SubscriptionCreate(BaseModel):
    space_public_id: str
    start_date: date
    end_date: date | None = None


class SubscriptionOut(BaseModel):
    public_id: str
    space_id: int
    space_public_id: str | None = None
    space_type: str | None = None
    location_name: str | None = None
    status: str
    start_date: date
    end_date: date | None
    stripe_subscription_id: str | None = None
    booking_mode: str | None = None
    membership_plan_public_id: str | None = None
    commitment_months: int | None = None
    commitment_start_date: date | None = None
    commitment_end_date: date | None = None
    included_meeting_room_hours_per_month: int = 0
    auto_renew: bool = False
    model_config = ConfigDict(from_attributes=True)


class MeetingRoomBalanceOut(BaseModel):
    period_start: date
    period_end: date
    granted_minutes: int
    used_minutes: int
    remaining_minutes: int
    overage_hourly_rate_cents: int | None = None
    model_config = ConfigDict(from_attributes=True)
