from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.enums import BookingRequestKind, BookingRequestStatus


class BookingRecurrenceCreate(BaseModel):
    frequency: str
    interval: int = Field(default=1, ge=1, le=12)
    count: int | None = Field(default=None, ge=1, le=52)
    until_date: date | None = None

    @model_validator(mode="after")
    def _validate_recurrence(self):
        if self.frequency not in {"weekly", "monthly"}:
            raise ValueError("frequency must be weekly or monthly")
        if self.count is None and self.until_date is None:
            raise ValueError("Provide count or until_date")
        return self


class GuestBookingRequestCreate(BaseModel):
    """Guest (unauthenticated) hourly or day-pass booking request."""

    space_public_id: str
    start_datetime: datetime
    end_datetime: datetime
    booking_mode: str = "hourly"  # 'hourly' | 'day_pass'
    full_day: bool = False

    guest_email: EmailStr
    guest_full_name: str = Field(min_length=1, max_length=255)
    guest_phone: str | None = Field(default=None, max_length=64)
    guest_company_name: str | None = Field(default=None, max_length=255)
    guest_notes: str | None = Field(default=None, max_length=1024)


class GuestBookingRequestOut(BaseModel):
    public_id: str
    status: BookingRequestStatus
    start_datetime: datetime
    end_datetime: datetime
    space_public_id: str | None = None
    estimated_amount: int | None = None
    message: str = "Your request has been submitted. The owner will review it and get back to you."

    model_config = ConfigDict(from_attributes=True)


class BookingRequestCreate(BaseModel):
    """Either an hourly/daily booking (space_public_id + datetimes) or a membership purchase
    (membership_plan_public_id + desired_start_date). Validated as XOR by the model_validator
    below.
    """

    space_public_id: str | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None

    membership_plan_public_id: str | None = None
    desired_start_date: date | None = None
    seats_requested: int = Field(default=1, ge=1)

    member_owner_payment_method_public_id: str | None = None
    payment_authorization_consent: bool = False

    # Explicit pricing-mode signals from the booking widget. Optional for backwards
    # compat with older clients; modern widgets always send one of these.
    booking_mode: str | None = None  # 'hourly' | 'day_pass'
    full_day: bool = False
    recurrence: BookingRecurrenceCreate | None = None

    @model_validator(mode="after")
    def _validate_xor(self):
        if self.booking_mode is not None and self.booking_mode not in {"hourly", "day_pass"}:
            raise ValueError("booking_mode must be hourly or day_pass")
        is_booking = bool(self.space_public_id and self.start_datetime and self.end_datetime)
        is_membership = bool(self.membership_plan_public_id and self.desired_start_date)
        if is_booking and is_membership:
            raise ValueError(
                "Provide either booking fields (space_public_id + start/end_datetime) OR "
                "membership fields (membership_plan_public_id + desired_start_date), not both"
            )
        if not is_booking and not is_membership:
            raise ValueError(
                "Provide booking fields (space_public_id + start/end_datetime) OR "
                "membership fields (membership_plan_public_id + desired_start_date)"
            )
        return self


class BookingPaymentSummary(BaseModel):
    status: str | None = None
    amount: int | None = None
    amount_cents: int | None = None
    currency: str | None = None
    attempt_number: int | None = None
    failure_reason: str | None = None
    attempted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class BookingRequestOut(BaseModel):
    public_id: str
    space_id: int
    space_public_id: str | None = None
    user_id: int | None = None
    booking_id: int | None = None
    booking_public_id: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    status: BookingRequestStatus
    payment_status: str | None = None
    payment_provider: str | None = None
    member_owner_payment_method_public_id: str | None = None
    approved_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_deadline_at: datetime | None = None
    payment_authorization_consent_at: datetime | None = None
    operator_notes: str | None = None
    instant_booking: bool = False
    booking_series_public_id: str | None = None
    occurrence_count: int = 1
    recurrence_frequency: str | None = None
    recurrence_interval: int | None = None
    recurrence_count: int | None = None
    recurrence_until_date: date | None = None
    payment_breakdown: dict | None = None
    refund_policy_snapshot: dict | None = None
    price_daily: int | None = None
    price_monthly: int | None = None
    price_hourly: int | None = None
    estimated_amount: int | None = None
    # Pricing breakdown for the booking widget and approval email.
    base_amount_cents: int | None = None
    discount_percent: int = 0
    discount_amount_cents: int = 0
    tax_amount_cents: int = 0
    rate_basis: str | None = None
    units: float | None = None
    payment_attempt_count: int | None = None
    failure_reason: str | None = None
    last_payment: BookingPaymentSummary | None = None

    request_kind: BookingRequestKind = BookingRequestKind.HOURLY_BOOKING
    membership_plan_public_id: str | None = None
    desired_start_date: date | None = None
    seats_requested: int = 1
    commitment_months_snapshot: int | None = None

    is_guest_checkout: bool = False
    guest_email: str | None = None
    guest_full_name: str | None = None
    guest_phone: str | None = None
    guest_company_name: str | None = None
    guest_notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class BookingRequestDecision(BaseModel):
    operator_notes: str | None = None


class BookingRequestRetryPayment(BaseModel):
    operator_notes: str | None = None
