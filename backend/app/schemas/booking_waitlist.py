from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BookingWaitlistCreate(BaseModel):
    space_public_id: str | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    booking_mode: str | None = None
    full_day: bool = False
    seats_requested: int = Field(default=1, ge=1)

    membership_plan_public_id: str | None = None
    desired_start_date: date | None = None

    @model_validator(mode="after")
    def _validate_target(self):
        if self.booking_mode is not None and self.booking_mode not in {"hourly", "day_pass"}:
            raise ValueError("booking_mode must be hourly or day_pass")
        direct = bool(self.space_public_id and self.start_datetime and self.end_datetime)
        lease = bool(self.membership_plan_public_id and self.desired_start_date)
        if direct and lease:
            raise ValueError("Join the waitlist for either a booking slot or a membership/lease plan, not both")
        if not direct and not lease:
            raise ValueError("Provide booking slot fields or membership/lease plan fields")
        return self


class BookingWaitlistInvite(BaseModel):
    operator_notes: str | None = None


class BookingWaitlistOut(BaseModel):
    public_id: str
    created_at: datetime | None = None
    status: str
    space_public_id: str | None = None
    space_name: str | None = None
    space_type: str | None = None
    organization_name: str | None = None
    location_public_id: str | None = None
    location_name: str | None = None
    location_city: str | None = None
    member_public_id: str | None = None
    member_name: str | None = None
    member_email: str | None = None
    membership_plan_public_id: str | None = None
    membership_plan_name: str | None = None
    booking_request_public_id: str | None = None
    request_kind: str
    booking_mode: str | None = None
    full_day: bool = False
    seats_requested: int = 1
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    desired_start_date: date | None = None
    invited_at: datetime | None = None
    invite_expires_at: datetime | None = None
    cancelled_at: datetime | None = None
    booked_at: datetime | None = None
    operator_notes: str | None = None
    booking_href: str | None = None

    model_config = ConfigDict(from_attributes=True)
