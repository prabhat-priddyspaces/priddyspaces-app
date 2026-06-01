from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.enums import BookingRequestKind, BookingRequestStatus
from app.schemas.money import MoneyAmount


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
    redemption_lock_public_id: str | None = None


class GuestBookingRequestOut(BaseModel):
    public_id: str
    status: BookingRequestStatus
    start_datetime: datetime
    end_datetime: datetime
    space_public_id: str | None = None
    estimated_amount: MoneyAmount | None = None
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
    redemption_lock_public_id: str | None = None

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


class BookingPricePreviewCreate(BaseModel):
    space_public_id: str | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    booking_mode: str | None = None
    full_day: bool = False
    seats_requested: int = Field(default=1, ge=1)

    membership_plan_public_id: str | None = None
    desired_start_date: date | None = None

    @model_validator(mode="after")
    def _validate_preview_target(self):
        if self.booking_mode is not None and self.booking_mode not in {"hourly", "day_pass"}:
            raise ValueError("booking_mode must be hourly or day_pass")
        direct = bool(self.space_public_id and self.start_datetime and self.end_datetime)
        plan = bool(self.membership_plan_public_id and self.desired_start_date)
        if direct and plan:
            raise ValueError("Preview either a direct booking or a membership/lease, not both")
        if not direct and not plan:
            raise ValueError("Provide direct booking fields or membership fields")
        return self


class BookingPricePreviewLineItem(BaseModel):
    label: str
    amount_cents: int


class BookingPricePreviewOut(BaseModel):
    currency: str = "usd"
    base_amount_cents: int
    setup_fee_amount_cents: int = 0
    discount_amount_cents: int = 0
    tax_amount_cents: int = 0
    total_amount_cents: int
    rate_basis: str | None = None
    units: float | None = None
    quantity: int = 1
    line_items: list[BookingPricePreviewLineItem] = Field(default_factory=list)


class BookingPaymentSummary(BaseModel):
    status: str | None = None
    amount: int | None = None
    amount_cents: int | None = None
    currency: str | None = None
    attempt_number: int | None = None
    failure_reason: str | None = None
    attempted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class BookingEmailDeliverySummary(BaseModel):
    notification_type: str
    label: str
    status: str
    attempt_count: int = 0
    recipient_count: int = 0
    failed_count: int = 0
    last_attempt_at: datetime | None = None
    last_error: str | None = None
    recipients: list[str] = Field(default_factory=list)


class BookingEmailDeliveryOut(BaseModel):
    public_id: str
    notification_type: str
    label: str
    recipient_email: str
    recipient_role: str | None = None
    subject: str
    status: str
    provider_message_id: str | None = None
    error_label: str | None = None
    error: str | None = None
    sent_at: datetime | None = None
    last_event_at: datetime | None = None
    created_at: datetime | None = None


class BookingEmailResendRequest(BaseModel):
    notification_type: str


class BookingRequestSupportContact(BaseModel):
    name: str
    title: str


class BookingRequestOut(BaseModel):
    public_id: str
    created_at: datetime | None = None
    space_id: int
    space_public_id: str | None = None
    space_name: str | None = None
    space_type: str | None = None
    organization_name: str | None = None
    location_public_id: str | None = None
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_postal_code: str | None = None
    location_timezone: str | None = None
    location_public_phone: str | None = None
    location_public_email: str | None = None
    support_contacts: list[BookingRequestSupportContact] = Field(default_factory=list)
    user_id: int | None = None
    member_public_id: str | None = None
    member_name: str | None = None
    member_email: str | None = None
    member_phone: str | None = None
    member_company_name: str | None = None
    booking_id: int | None = None
    booking_public_id: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    status: BookingRequestStatus
    payment_status: str | None = None
    payment_provider: str | None = None
    member_owner_payment_method_public_id: str | None = None
    payment_method_brand: str | None = None
    payment_method_last4: str | None = None
    payment_method_exp_month: int | None = None
    payment_method_exp_year: int | None = None
    redemption_lock_public_id: str | None = None
    loyalty_points_used: int = 0
    loyalty_discount_cents: int = 0
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_deadline_at: datetime | None = None
    payment_hold_expires_at: datetime | None = None
    payment_failed_at: datetime | None = None
    booking_approval_mode: str = "manual"
    membership_lease_approval_mode: str = "manual"
    payment_failure_hold_minutes: int | None = None
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
    price_daily: MoneyAmount | None = None
    price_monthly: MoneyAmount | None = None
    price_hourly: MoneyAmount | None = None
    estimated_amount: MoneyAmount | None = None
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
    email_delivery_summary: list[BookingEmailDeliverySummary] = Field(default_factory=list)

    request_kind: BookingRequestKind = BookingRequestKind.HOURLY_BOOKING
    membership_plan_public_id: str | None = None
    membership_plan_name: str | None = None
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


class BookingRequestPaymentMethodUpdate(BaseModel):
    member_owner_payment_method_public_id: str
    payment_authorization_consent: bool = False
