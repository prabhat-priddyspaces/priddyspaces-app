from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.models.enums import BookingStatus


class BookingCreate(BaseModel):
    space_public_id: str
    start_datetime: datetime
    end_datetime: datetime


class BookingOut(BaseModel):
    public_id: str
    start_datetime: datetime
    end_datetime: datetime
    status: BookingStatus
    model_config = ConfigDict(from_attributes=True)


class BookingUpdateIn(BaseModel):
    status: BookingStatus


class BookingCancelOut(BaseModel):
    public_id: str
    status: BookingStatus
    refund_percent: int

    model_config = ConfigDict(from_attributes=True)


class BookingCheckInOut(BaseModel):
    public_id: str
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
