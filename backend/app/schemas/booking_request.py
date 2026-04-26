from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BookingRequestStatus


class BookingRequestCreate(BaseModel):
    space_public_id: str
    start_datetime: datetime
    end_datetime: datetime


class BookingRequestOut(BaseModel):
    public_id: str
    space_id: int
    space_public_id: str | None = None
    user_id: int
    booking_id: int | None = None
    booking_public_id: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    status: BookingRequestStatus
    operator_notes: str | None = None
    price_daily: int | None = None
    price_monthly: int | None = None
    estimated_amount: int | None = None

    model_config = ConfigDict(from_attributes=True)


class BookingRequestDecision(BaseModel):
    operator_notes: str | None = None
