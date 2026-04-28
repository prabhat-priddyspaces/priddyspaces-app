from pydantic import BaseModel, ConfigDict

from app.models.enums import BookingMode


class SpaceBookingModeUpsert(BaseModel):
    booking_mode: BookingMode
    is_enabled: bool = True


class SpaceBookingModeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    booking_mode: BookingMode
    is_enabled: bool
