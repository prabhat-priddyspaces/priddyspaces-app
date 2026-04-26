from datetime import time
from pydantic import BaseModel, ConfigDict

from app.models.enums import AvailabilityStatus, SpaceType, SpaceVisibility


class SpaceCreate(BaseModel):
    location_public_id: str
    name: str | None = None
    space_type: SpaceType
    capacity: int = 1
    price_monthly: int | None = None
    price_daily: int | None = None
    availability_start_time: time | None = None
    availability_end_time: time | None = None
    visibility: SpaceVisibility = SpaceVisibility.PUBLIC
    amenities: str | None = None


class SpaceOut(BaseModel):
    public_id: str
    name: str
    space_type: SpaceType
    capacity: int
    price_monthly: int | None
    price_daily: int | None
    availability_status: AvailabilityStatus
    availability_start_time: time | None
    availability_end_time: time | None
    visibility: SpaceVisibility
    amenities: str | None
    model_config = ConfigDict(from_attributes=True)


class SpaceUpdate(BaseModel):
    name: str | None = None
    space_type: SpaceType | None = None
    capacity: int | None = None
    price_monthly: int | None = None
    price_daily: int | None = None
    availability_status: AvailabilityStatus | None = None
    availability_start_time: time | None = None
    availability_end_time: time | None = None
    visibility: SpaceVisibility | None = None
    amenities: str | None = None
