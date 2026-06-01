from datetime import time
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AvailabilityStatus, SpaceType, SpaceVisibility
from app.schemas.money import MoneyAmount
from app.schemas.space_setup_fee import SetupFeeItemIn


class SpaceCreate(BaseModel):
    location_public_id: str
    name: str | None = None
    space_type: SpaceType
    capacity: int = 1
    price_monthly: MoneyAmount | None = None
    price_daily: MoneyAmount | None = None
    price_hourly: MoneyAmount | None = None
    availability_start_time: time | None = None
    availability_end_time: time | None = None
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0
    visibility: SpaceVisibility = SpaceVisibility.PUBLIC
    priddy_points_enabled: bool | None = None
    owner_points_enabled: bool | None = None
    amenities: str | None = None
    setup_fee_items: list[SetupFeeItemIn] = Field(default_factory=list, max_length=20)


class SpaceOut(BaseModel):
    public_id: str
    organization_name: str | None = None
    booking_approval_mode: str = "manual"
    payment_failure_hold_minutes: int | None = None
    name: str
    space_type: SpaceType
    capacity: int
    price_monthly: MoneyAmount | None
    price_daily: MoneyAmount | None
    price_hourly: MoneyAmount | None = None
    availability_status: AvailabilityStatus
    availability_start_time: time | None
    availability_end_time: time | None
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0
    visibility: SpaceVisibility
    priddy_points_enabled: bool | None = None
    owner_points_enabled: bool | None = None
    amenities: str | None
    model_config = ConfigDict(from_attributes=True)


class SpaceUpdate(BaseModel):
    name: str | None = None
    space_type: SpaceType | None = None
    capacity: int | None = None
    price_monthly: MoneyAmount | None = None
    price_daily: MoneyAmount | None = None
    price_hourly: MoneyAmount | None = None
    availability_status: AvailabilityStatus | None = None
    availability_start_time: time | None = None
    availability_end_time: time | None = None
    buffer_before_minutes: int | None = None
    buffer_after_minutes: int | None = None
    visibility: SpaceVisibility | None = None
    priddy_points_enabled: bool | None = None
    owner_points_enabled: bool | None = None
    amenities: str | None = None
