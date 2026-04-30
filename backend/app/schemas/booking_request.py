from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import BookingRequestKind, BookingRequestStatus


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

    customer_owner_payment_method_public_id: str | None = None
    payment_authorization_consent: bool = False

    # Explicit pricing-mode signals from the booking widget. Optional for backwards
    # compat with older clients; modern widgets always send one of these.
    booking_mode: str | None = None  # 'hourly' | 'day_pass'
    full_day: bool = False

    @model_validator(mode="after")
    def _validate_xor(self):
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
    user_id: int
    booking_id: int | None = None
    booking_public_id: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    status: BookingRequestStatus
    payment_status: str | None = None
    payment_provider: str | None = None
    customer_owner_payment_method_public_id: str | None = None
    approved_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_deadline_at: datetime | None = None
    payment_authorization_consent_at: datetime | None = None
    operator_notes: str | None = None
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

    model_config = ConfigDict(from_attributes=True)


class BookingRequestDecision(BaseModel):
    operator_notes: str | None = None


class BookingRequestRetryPayment(BaseModel):
    operator_notes: str | None = None
